/* mocha --ui tdd tests/test.js  */

var compareAst = require('compare-ast');
var assert = require('assert');


/* Libraries */
var esprima = require('../lib/esprima.js');
var escodegen = require('../lib/escodegen.js');


/* Stip - constructing pdg */


var Exceptions = require('../aux/exceptions.js');
var Stip = require('../run.js');


function tiersplit(src, analysis) {
    var program;

    program = Stip.tierSplit(src, analysis);
    clientprogram = program.clientprogram;
    serverprogram = program.serverprogram;
    if (clientprogram && serverprogram)
        program.errors = program.errors.concat(clientprogram.warnings.concat(serverprogram.warnings));

    return program;
}


suite('Tier split - exceptions', function () {

    test('@reply outside function', function () {
        var res = tiersplit('/* @server */ {/* @reply */ foo(); } /* @client */ {function foo() {return 42}}', true);
        var warnings = res.errors;
        assert.equal(warnings.length, 1);
        assert.equal(warnings[0].name, Exceptions.ReplyAnnotationLocation.name);
    });

    /* @reply in a function that is only called locally (server) */
    test('@reply in non-transformed function', function () {
        var res = tiersplit('/* @server */ {function foo() {/* @reply */ bar()} foo(); }  /* @client */ { function bar () {} }', true);
        var warnings = res.errors;
        assert.equal(warnings.length, 1);
        assert.equal(warnings[0].name, Exceptions.ReplyAnnotationLocation.name);
    });

    test('correct @reply', function () {
        var res = tiersplit('/* @server */ {function foo() {/* @reply */ bar()} foo();} /* @client */ {function bar() {} foo();}', true);
        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;
        var warnings = res.errors;
        compareAst(escodegen.generate(ast0),
            'client.rpc("foo", function (_v0_, _v1_) {}); client.expose({"bar": function (callback) {}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'function foo() {server.rpc("bar", [])} foo(); server.expose({"foo": function (callback) {var self=this;self.rpc("bar")}})',
            {varPattern: /_v\d_/});
        assert.equal(warnings.length, 1);
        assert.equal(warnings[0].name, Exceptions.ReplyAnnotationLocation.name);
    });

    test('local declaration used in other tier', function () {
        var res = tiersplit('/* @server */ {/* @local */ var a = 22; var b = a * 3; } /* @client */ {var d = a * 2;}', true);
        var warnings = res.errors;
        assert.equal(warnings.length, 1);
        assert.equal(warnings[0].name, Exceptions.LocalUsedByOtherTier.name);
    });

    test('higher order function - multiple functions without annotation', function () {
        var res = tiersplit('/* @server */ {function z() {}} /* @client */ {function higherO(fn, x) {return fn(x)} function incr(x) {return x + 1} function id(x) {return x}; higherO(id, 2); higherO(incr, 2);}', true);
        var warnings = res.errors;
        assert.equal(warnings.length, 1);
        assert.equal(warnings[0].name, Exceptions.MultipleFunctionsCalledError.name);
    });
    test('higher order function - multiple functions with local annotation', function () {
        var res = tiersplit('/* @server */ {function z() {}} /* @client */ {function higherO(fn, x) {/* @localCall */ return fn(x)} function incr(x) {return x + 1} function id(x) {return x}; higherO(id, 2); higherO(incr, 2);}', true);
        var warnings = res.errors;
        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;
        assert.equal(warnings.length, 0);
        compareAst(escodegen.generate(ast0),
            'function higherO(fn, x) {return fn(x);} function incr(x) {return x + 1;} function id(x) {return x} higherO(id, 2); higherO(incr, 2); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'function z() {} server.expose({})',
            {varPattern: /_v\d_/});

    });
    test('higher order function - multiple functions with remote annotation', function () {
        var res = tiersplit('/* @server */ {function z() {}} /* @client */ {function higherO(fn, x) {/* @remoteCall */ return fn(x)} function incr(x) {return x + 1} function id(x) {return x}; higherO(id, 2); higherO(incr, 2);}', true);
        assert.equal(res.errors.length, 0);

    })


})

suite('Tier split - exceptions without analysis', function () {

    test('@reply outside function', function () {
        var res = tiersplit('/* @server */ {/* @remoteCall @reply */ foo(); } /* @client */ {/* @remoteFunction */ function foo() {return 42}}', false);
        var warnings = res.errors;
        assert.equal(warnings.length, 1);
        assert.equal(warnings[0].name, Exceptions.ReplyAnnotationLocation.name);
    });

    /* @reply in a function that is only called locally (server) */
    test('@reply in non-transformed function', function () {
        var res = tiersplit('/* @server */ {/* @remoteFunction @localFunction */ function foo() {/* @remoteCall @reply */ bar()} foo(); }  /* @client */ { /* @remoteFunction */ function bar () {} }', false);
        var warnings = res.errors;
        assert.equal(warnings.length, 1);
        assert.equal(warnings[0].name, Exceptions.ReplyAnnotationLocation.name);
    });

    test('correct @reply', function () {
        var res = tiersplit('/* @server */ {/* @remoteFunction @localFunction */ function foo() {/* @remoteCall @reply */ bar()} foo();} /* @client */ {/* @remoteFunction */ function bar() {} /* @remoteCall */ foo();}', false);
        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;
        var warnings = res.errors;
        compareAst(escodegen.generate(ast0),
            'client.rpc("foo", function (_v0_, _v1_) {}); client.expose({"bar": function (callback) {}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'function foo() {server.rpc("bar", [])} foo(); server.expose({"foo": function (callback) {var self=this;self.rpc("bar")}})',
            {varPattern: /_v\d_/});
        assert.equal(warnings.length, 1);
        assert.equal(warnings[0].name, Exceptions.ReplyAnnotationLocation.name);
    });

    test('local declaration used in other tier', function () {
        var res = tiersplit('/* @server */ {/* @local */ var a = 22; var b = a * 3; } /* @client */ {var d = a * 2;}', false);
        var warnings = res.errors;
        assert.equal(warnings.length, 0);
    });

});
