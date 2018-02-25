/************************************/
/* Command line version of Stip     */
/************************************/
var stip     = require("./run.js");
var fs       = require("fs");
var path     = require("path");
var utils    = require("./redstone/utils.js");
var escodegen = require("escodegen");
var chalk      = require("chalk");


var error = chalk.bold.red;
var green = chalk.bold.green;
// Load given file as argument from CLI
var inputFile = process.argv[2];

if (inputFile === undefined) {
    chalk.red("No input file given.");
    process.exit(1);
}

// Read the file from disk
try {
     fs.statSync(inputFile);
} catch (e) {
    console.log(error("Could not read file!"));
    process.exit(1);
}

// Run Stip tool
var input = utils.readFile(inputFile);
var result = stip.tierSplit(input, true);
var client = result.clientprogram;
var server = result.serverprogram;
var html   = result.html;
var warnings = result.errors;

if (warnings.length > 0) {
    console.log(error(">> ERRORS ENCOUNTERED: \n"));
    warnings.map(function (e) {
        console.log("  " + e.name + " : " + e);
        console.log(e.stack);
    })
}
else {
    console.log(green("No errors encountered \n"));

    var PDG = result.graphs.PDG;

    // Output the result in files

    if (server) {
        utils.writeFile("output/server_env/server.js", escodegen.generate(server.program));
    } else {
        console.log(error("!! No server!"));
    }

    if (client) {
        utils.writeFile("output/client_env/js/client.js", escodegen.generate(client.program));
    } else {
        console.log(error("!! no client!"));
    }

    if (html) {
        utils.writeFile("output/client_env/index.html", html);
    }

    console.log(chalk.green("Results written to /output\n"));

    /* Placement strategy report */
    var clientfs = [];
    var serverfs = [];
    PDG.getFunctionalityNodes().map(function (f) {
        if (f.tier === DNODES.SERVER)
            serverfs.push(f.ftype);
        if (f.tier === DNODES.CLIENT)
            clientfs.push(f.ftype);
        if (f.tier === DNODES.SHARED) {
            clientfs.push(f.ftype);
            serverfs.push(f.ftype);
        }

    });
    console.log(chalk.white.bgCyan.bold("placement strategy report"));
    console.log(chalk.cyan("\tclient slices"));
    clientfs.map(function (r) {
        console.log("\t - " + r);
    });
    console.log(chalk.cyan("\tserver slices"));
    serverfs.map(function (r) {
        console.log("\t - " + r);
    });
    clientperc = clientfs.length / (clientfs.length + serverfs.length);
    serverperc = serverfs.length / (clientfs.length + serverfs.length);
    var chart = chalk.bold("\n \t 0% [ ");
    var drawClient = Math.round(clientperc * 10);
    for (var i = 0; i < 10; i++) {
        if (i <= drawClient)
            chart += chalk.bgMagenta("  ");
        else
            chart += chalk.bgGreen("  ");

    }
    chart += chalk.bold(" ] 100% \n");
    chart += "\t" + chalk.bgMagenta(" ") + " = client\n";
    chart += "\t" + chalk.bgGreen(" ") + " = server\n";
    console.log(chart);

    console.log("\tApplication level of offline availability: " +  chalk.blue(Math.floor(result.placementinfo.fitness * 100) + "%"));

    PDG.getFunctionalityNodes().forEach(function (n) {
        var advice = Advice.advice(n, PDG);
        if (!advice.placement) {
            if (advice.calls.length > 0) {
                console.log("\t"+n.ftype + " has " + advice.callRemote + " remote calls, versus " + advice.callLocal + " local calls.");
                console.log("\tConsider moving following functions:")
            }
            advice.calls.forEach(function (c) {
                if (Aux.isFunDecl(c.parsenode))
                    console.log("\t  - "+ escodegen.generate(c.parsenode.id));
            })
            if (advice.constructorsInRemote.length > 0)
                console.log("\tConsider making following constructors replicated or observable");
            advice.constructorsInRemote.forEach(function (constructor) {
                console.log("\t - " + escodegen.generate(constructor.parsenode.id));
            })
            if (advice.dataInRemote.length > 0)
                console.log("\tConsider making following declaration replicated or observable");
            advice.dataInRemote.forEach(function (decl) {
                console.log("\t - " + escodegen.generate(decl.parsenode));
            })
            if (advice.entriesOnlyClient.length > 0) {
                console.log("\tConsider moving following functions to new slice:");
                console.log("\t[currently shared but only called by client tier]");
                advice.entriesOnlyClient.forEach(function (entry) {
                    console.log("\t - " + escodegen.generate(entry.parsenode.id));
                })
            }
            if (advice.entriesOnlyServer.length > 0) {
                console.log("\tConsider moving following functions to new slice:");
                console.log("\t[currently shared but only called by server tier]");
                advice.entriesOnlyServer.forEach(function (entry) {
                    console.log("\t - " + escodegen.generate(entry.parsenode.id));
                })
            }
        }

    })
}

// Exit
process.exit(0);
