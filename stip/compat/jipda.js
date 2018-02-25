var Assert = require('assert');

var Ast = require('./ast.js').Ast;
var Aux = require('../aux/aux.js');

function getCallExpression(node)
  {
    if (Aux.isCallExp(node) || Aux.isNewExp(node))
    {
      return node;
    }
    if (Aux.isExpStm(node))
    {
      return getCallExpression(node.expression);
    }
  }

function declarationOf(nameNode, ast)
    {
      Assert.ok(nameNode.name);
      var result = Ast.findDeclarationNode(nameNode.name, nameNode, ast);
      nameNode._declarationOf = result;
      return result;
    }

function isConstructor(funNode, ast) {
  var result = false;
  var newNodes = [];
  Aux.walkAst(ast, {
    pre: function(node) {
      if (Aux.isNewExp(node) && Aux.isIdentifier(node.callee) && funNode.id && node.callee.name === funNode.id.name) {
        newNodes.push(node);
      }
    },
    post: function(node) {

    }
  });
  return newNodes.some(function (node) {
    return declarationOf(node.callee, ast) === funNode;
  });
}

function functionsCalled(callNode, ast) {
  //console.error("Input call");
  //console.error(callNode.toString());
  var result = [];
  var callExpression = getCallExpression(callNode);
  if (!Aux.isIdentifier(callExpression.callee) || !Aux.isCallExp(callExpression)) {
    //console.error("Output");
    return result;
  }
  var declaration = declarationOf(callExpression.callee, ast);
  if (declaration.type !== 'FunctionDeclaration') {
    var functionDeclaration = Ast.parent(declaration, ast);
    if (!Aux.isFunDecl(functionDeclaration)) return [];
    var index = functionDeclaration.params.findIndex(function (param) {
      return param.name === callExpression.callee.name;
    });
    var callNodes = [];
    Aux.walkAst(ast, {
      pre: function(node) {
        if (Aux.isCallExp(node) && Aux.isIdentifier(node.callee) && node.callee.name === functionDeclaration.id.name) {
          callNodes.push(node);
        }
      },
      post: function(node) {

      }
    });
    callNodes.forEach(function (node) {
      if (Aux.isIdentifier(node.arguments[index])) {
        result.push(declarationOf(node.arguments[index], ast));
      }
    });
  } else {
    result = [declaration];
  }
  //console.error("Output");
  //result.forEach(function (r) { console.error(r.toString()); });
  return result;
}

var Jipda = new Object();
Jipda.getCallExpression = getCallExpression;
Jipda.declarationOf = declarationOf;
Jipda.isConstructor = isConstructor;
Jipda.functionsCalled = functionsCalled;

module.exports = Jipda;
