/****************************************************************
 *               TRANSFORMATIONS FOR NODE.JS                    *
 *                                                              *
 *      - wait.for library in combination with zerorpc          *
 *                                                              *
 *  Where possible, falafel.js is used for transformations      *
 *                                                              *
 ****************************************************************/


var Nodeify = (function () {


    var transformer = {};
    
    if (typeof module !== 'undefined' && module.exports != null) {
        JSify = require('./JSify').JSify;
    }

    function makeTransformer (transpiler) {
        switch (transpiler.options.asynccomm) {
        case 'callbacks':
            transpiler.parseUtils = {
                createRPC  : function (call) {
                        var parsenode = Pdg.getCallExpression(call.parsenode);
                        if (Aux.isMemberExpression(parsenode.callee) &&
                            asyncs.indexOf(parsenode.callee.object.name) >= 0) 
                            return JSParse.RPC;
                        else 
                            return NodeParse.RPC; 

                    },
                createCallback : NodeParse.callback,
                shouldTransform : shouldTransform,
                shouldTransformData : shouldTransformData,
                createAsyncFunction : NodeParse.asyncFun,
                createCbCall : NodeParse.createCallCb,
                createRPCReturn : NodeParse.RPCReturn,
                createAsyncReplyCall : NodeParse.asyncReplyC,
                createDataGetter : NodeParse.createDataGetter,
                createDataSetter : NodeParse.createDataSetter
            };
            transpiler.transformCPS = CPSTransform;
        }
    }

    var shouldTransformData = function (data) {
        var ctype = data.getFType();
        var otherctype = false;

        /* Declaration */
        if (data.isStatementNode && Aux.isVarDecl(data.parsenode)) {
            if (data.getOutNodes(EDGES.REMOTED).length > 0)
                return true;
            else  {       
                data.getOutNodes(EDGES.DATA).concat(data.getOutNodes(EDGES.REMOTED))
                    .map(function (node) {
                    if (!data.equalsFType(node))
                        otherctype = true;
                });
                return otherctype;
            }

        }

        if (data.getInEdges(EDGES.REMOTED).length > 0)
            return true;

        data.getInNodes(EDGES.DATA).concat(data.getInNodes(EDGES.REMOTED))
            .map(function (node) {
                if ( !data.equalsFType(node))
                    otherctype = true;
            });
        return otherctype;

    }

    var shouldTransform = function (call) {
        var parsenode = Pdg.getCallExpression(call.parsenode),
            entrynode,   
            entryCType,  
            callCType;  
        if (call.primitive) {
            return false;
        } 
        else if (Aux.isMemberExpression(parsenode.callee) &&
            asyncs.indexOf(parsenode.callee.object.name) >= 0) 
            return true;

        else if (call.getEntryNode().length > 0) {
            entrynode  = call.getEntryNode()[0],
            entryCType = entrynode.getTier(),
            callCType  = call.getTier(); 
            /* Only client->server calls should be transformed by CPS module */
            return !(entryCType === DNODES.CLIENT  && 
                     callCType === DNODES.SERVER)  &&
                    (entryCType === DNODES.SERVER  &&
                     callCType === DNODES.CLIENT)  && 
                    entryCType  !== DNODES.SHARED
            }
    }

    /* Variable Declaration */
    function nodeifyVarDecl (transpiler) {
        var node    = transpiler.node,
            entry   = node.getOutNodes(EDGES.DATA)
                          .filter(function (n) {
                            return n.isEntryNode;
                    }),
            call    = node.getOutNodes(EDGES.CONTROL)
                          .filter(function (n) {
                            return n.isCallNode;
                    }),
            objects  = node.getOutNodes(EDGES.DATA)
                        .filter(function (n) {
                             var parent = Ast.parent(n.parsenode, transpiler.ast);
                             return n.isObjectEntry && !Aux.isRetStm(parent);
                     }),
            transpiled;
        makeTransformer(transpiler);
        if (Aux.isVarDeclarator(node.parsenode))
            node.parsenode = NodeParse.createVarDecl(node.parsenode);
        
        /* Outgoing data dependency to entry node? -> Function Declaration */
        if (entry.length > 0) {
            entry = entry[0]; /* always 1, if assigned later on, the new one would be attached to assignment node */
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, entry));
            if (entry.isServerNode() && entry.clientCalls() > 0 ||
                entry.isClientNode() && entry.serverCalls() > 0) {
                /* set the name of the method */
                transpiled.method.setName(Aux.getDeclaration(node.parsenode).id);
                transpiler.methods.push(transpiled.method.parsenode);
                transpiled.method = false;
                transpiler.nodes = transpiled.nodes.remove(entry);
            }
            node.parsenode.declarations.init = transpiler.parsednode;
            transpiler.nodes = transpiled.nodes;
            
        }
        
        /* Outgoing data dependency to object entry node? */
        if (objects.length > 0) {
            var elements = [];

            objects.map(function (object) {
                transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, object));

                if (Aux.isVarDecl(node.parsenode) && 
                    Aux.isArrayExp(node.parsenode.declarations[0].init)) {
                    elements.push(transpiled.transpiledNode);
                    
                } 
                else if (Aux.isVarDecl(node.parsenode)) {
                    Aux.getDeclaration(node.parsenode).init = transpiled.transpiledNode;
                }

                else if (Aux.isExpStm(node.parsenode) && 
                    Aux.isAssignmentExp(node.parsenode.expression)) {
                    node.parsenode.right = transpiled.transpiledNode;
                }

                transpiler.nodes = transpiled.nodes;
            });
            if (call.length > 0) {
                call.map(function (call) {
                    //if (call.parsenode && Aux.isNewExp(call.parsenode))
                        transpiler.nodes = transpiler.nodes.remove(call);
                })
            }

            if (Aux.isVarDecl(node.parsenode) && 
                Aux.isArrayExp(Aux.getDeclaration(node.parsenode).init)) {
                Aux.getDeclaration(node.parsenode).init.elements = elements;
            } 
        }

        /* Outgoing dependency on call nodes?
         * -> nodeify every call (possibly rpcs) */
        else if (call.length > 0) {
            transpiled = transpiler.transformCPS.transformExp(transpiler);
            transpiler.nodes = transpiled[0];
            transpiler.transpiledNode = transpiled[1].parsenode;

            return transpiler;
        }

        transpiler.transpiledNode = node.parsenode;

        return transpiler;
    }

    function transformVariableDeclData (transpiler) {
        var transpiled = nodeifyVarDecl(transpiler),
            node = transpiled.node,
            ctype = node.getFType(),
            tier = transpiler.options.tier,
            servercnt = 0,
            clientcnt = 0,
            sharedcnt = 0,
            declarationnode,
            declarationtype,
            closeup, name, init;
        makeTransformer(transpiler);

        if (Aux.isVarDecl(node.parsenode)) {
            declarationnode = node;
        } 
        else if (Aux.isExpStm(node.parsenode) && Aux.isAssignmentExp(node.parsenode.expression)) {
            if (Aux.isMemberExpression(node.parsenode.expression.left) && 
                Aux.isThisExpression(node.parsenode.expression.left.object)) {
                declarationnode = node;
            }
            else  {
                node.getInNodes(EDGES.DATA).concat(node.getInNodes(EDGES.REMOTED))
                    .map(function(n) {
                        if (n.isStatementNode &&
                            (Aux.isVarDecl(n.parsenode) ||
                             Aux.isVarDeclarator(n.parsenode)) &&
                            n.name === node.name)
                        declarationnode = n;
                    });
            }

        }

        /* no declaration node in the case of actual parameter */
        if (declarationnode) {
            declarationtype = declarationnode.getFType();
            if (!declarationnode.sharedcnt) {
                declarationnode.getOutNodes(EDGES.DATA).concat(declarationnode.getOutNodes(EDGES.REMOTED))
                    .map(function (dnode) {
                        var ctype = dnode.getFType();
                        if (fTypeEquals(ctype, DNODES.SHARED)) sharedcnt++;
                        if (fTypeEquals(ctype, DNODES.SERVER)) servercnt++;
                        if (fTypeEquals(ctype, DNODES.CLIENT)) clientcnt++;
                });
                /* Store for later */
                declarationnode.sharedcnt = sharedcnt;
                declarationnode.servercnt = servercnt;
                declarationnode.clientcnt = clientcnt;

            }

            var getter = NodeParse.createDataGetter(node.name);
            var setter = transpiler.parseUtils.createDataSetter(node.name, NodeParse.createIdentifier(node.name));

            if (Aux.isExpStm(node.parsenode) && Aux.isMemberExpression(node.parsenode.expression.left)) {
                setter.expression.arguments[0] = NodeParse.createLiteral(node.name);
                setter.expression.arguments[1] = node.parsenode.expression.left.object;
            }

            /* declaration node is shared */
            if (fTypeEquals(declarationtype, DNODES.SHARED)) {
                /* Declaration node itself */
                if (Aux.isVarDecl(node.parsenode) && 
                    declarationnode.clientcnt > 0 &&
                    declarationnode.servercnt > 0 ) {
                    if (tier === DNODES.CLIENT) {
                        transpiled.transpiledNode = Aux.clone(transpiled.transpiledNode);
                        transpiled.transpiledNode.declarations[0].init = getter.expression;
                    }
                }
                else if (declarationnode.clientcnt > 0 && declarationnode.servercnt > 0) {
                    if (tier === DNODES.CLIENT)
                        transpiled.transpiledNode = false;
                    else
                        transpiled.closeupNode = [setter];
                }
            }

            if (fTypeEquals(declarationtype, DNODES.SERVER)) {
                if (Aux.isVarDecl(node.parsenode) &&
                    declarationnode.clientcnt > 0) {
                    if (tier === DNODES.CLIENT) {
                        transpiled.transpiledNode = Aux.clone(transpiled.transpiledNode);
                        transpiled.transpiledNode.declarations[0].init = getter.expression;
                    }
                } 
                /* Defined on server, used on server */
                else if (declarationnode.equalsFunctionality(node) && declarationnode.clientcnt > 0) {
                    transpiled.closeupNode = [setter];
                }
                else if (declarationnode.clientcnt > 0) {
                    transpiled.closeupNode = [setter];
                }
            }
        }

        return transpiled;
    }

    transformer.transformVariableDecl = transformVariableDeclData;
    transformer.transformAssignmentExp = transformVariableDeclData;

    /* Binary Expression */
    transformer.transformBinaryExp = JSify.transformBinaryExp;


    /* Function expression */
    function nodeifyFunExp (transpiler) {
        /* Formal parameters */
        var node      = transpiler.node,
            form_ins  = node.getFormalIn(),
            form_outs = node.getFormalOut(),
            parsenode = node.parsenode,
            localparsenode = Aux.clone(node.parsenode),
            params    = parsenode.params,
            parent    = Ast.parent(parsenode, transpiler.ast),
            transpiledNode, transpiled;


        makeTransformer(transpiler);
        if (node.isObjectEntry) {
            return nodeifyFunConstructor(transpiler);
        }


        /* recheck the calls. This is because anonymous generated functions that are in a slice
           that did not have a tier at the time of construction, won't have a registered call */
        if (node.parsenode.generated) {
            if (node.isServerNode())
                node.serverCallsGen = 1;
            if (node.isClientNode())
                node.clientCallsGen = 1;
        }


        /* Formal in parameters */
        if(form_ins.length > 0) {
            /* Remove parameters that are not in nodes */
            for(var i = 0; i < form_ins.length; i++) {
                var fp = form_ins[i],
                     p = params[i];
                if(!nodesContains(transpiler.nodes,fp)) {
                    params.splice(i, 1);
                }
                transpiler.nodes = transpiler.nodes.remove(fp);
            }
            parsenode.params = params;
        };

        /* Formal out parameters */
        form_outs.map(function (f_out) {
            transpiler.nodes = transpiler.nodes.remove(f_out);
        })

        /* Body */
        var localbody = [],
            remotebody = [],
            bodynodes = node.getOutEdges(EDGES.CONTROL).filter(function (e) {
                return !e.to.isFormalNode //e.to.isStatementNode || e.to.isCallNode;
            }).map(function (e) { return e.to }).sort(function (n1, n2) { 
                return n1.cnt - n2.cnt;
            }); 

        /* nodeify every body node */
        bodynodes.map(function (n) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, n));
            if (nodesContains(transpiler.nodes, n)) {
                remotebody = remotebody.concat(transpiled.getTransformed());
                /* Separate localbody from exposed method body */
                if (!transpiled.transpiledNode.__transformed)
                    localbody.push(Aux.clone(n.parsenode));
                else if (Aux.isRetStm(n.parsenode))
                    localbody.push(Aux.clone(n.parsenode));
                else
                    localbody = localbody.concat(transpiled.getTransformed());
            }
            transpiler.nodes = transpiled.nodes.remove(n);
            transpiled.closeupNode = transpiled.setupNode = [];
            Transpiler.copySetups(transpiled, transpiler);
        });

        transpiler.nodes = transpiler.nodes.remove(node);
        localparsenode.body.body = localbody;
        parsenode.body.body = remotebody;
        transpiledNode = localparsenode;

 
        /* CASE 2 : Server function that is called by client side */
        if(node.isServerNode() && node.clientCalls() > 0) {
            transpiled = transpiler.transformCPS.transformFunction(transpiler);    
            transpiler.method = transpiled[1];
            transpiler.transpiledNode = undefined;
        }

        /* CASE 5 : Client function that is called by server side */ 
        if (node.isClientNode() && node.serverCalls() > 0) {
            transpiled = transpiler.transformCPS.transformFunction(transpiler);    
            transpiler.method = transpiled[1];
            transpiler.transpiledNode = undefined;
        }

        if ((node.isClientNode() && node.clientCalls() > 0) ||
            (node.isServerNode() && node.serverCalls() > 0) ||
            node.ctype === DNODES.SHARED ||
            node.parsenode.generated ||
            (node.clientCalls() == 0 && node.serverCalls() == 0)) {
            transpiler.nodes = transpiler.nodes.remove(node);
            transpiler.transpiledNode = transpiledNode;
        }

        if (! Aux.isVarDeclarator(parent) && transpiler.method.setName) {
            transpiler.method.setName(node.parsenode.id.name);
            transpiler.methods.push(transpiler.method.parsenode);
            transpiler.method = false;
        }

        return transpiler;
    }
    transformer.transformFunctionExp = nodeifyFunExp;
    transformer.transformFunctionDecl = nodeifyFunExp;



    function nodeifyFunConstructor (transpiler) {
      var node        = transpiler.node,
          constructor = node.getOutNodes(EDGES.OBJMEMBER)
                        .filter(function (n) {return n.isConstructor; })[0],
          properties  = node.getOutNodes(EDGES.OBJMEMBER)
                        .filter(function (n) {return !n.isConstructor; }),
          body        = [],
          form_ins    = constructor.getFormalIn(),
          form_outs   = constructor.getFormalOut(),
          parsenode   = node.parsenode,
          params      = parsenode.params,
          transpiled;
        // Formal in parameters
        if(form_ins.length > 0) {
            // Remove parameters that are not in nodes
            for (var i = 0; i < form_ins.length; i++) {
                var fp = form_ins[i],
                     p = params[i];
                if(!nodesContains(transpiler.nodes,fp)) {
                    params.splice(i,1);
                }
                transpiler.nodes = transpiler.nodes.remove(fp);
            }
            node.parsenode.params = params;
        };
        // Formal out parameters
        form_outs.map(function (f_out) {
            transpiler.nodes = transpiler.nodes.remove(f_out);
        })

      properties.map(function (property) {
        var propnode;
        if (nodesContains(transpiler.nodes, property)) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, property));
            body.push(transpiled.transpiledNode);
            transpiler.nodes = transpiled.nodes.remove(property);
        }
      })
      node.parsenode.body.body = body;
      transpiler.nodes = transpiler.nodes.remove(node);
      transpiler.nodes = transpiler.nodes.remove(constructor);
      transpiler.transpiledNode = node.parsenode;

      return transpiler;
    }


    /*
     * CALL EXPRESSION:
     * 1: function defined on SERVER, called on SERVER -> no transformation
     * 2: function defined on SERVER, called on CLIENT -> transform to Meteor method call
     * 3: function defined on SERVER, called by BOTH   -> combination of previous cases
     * 4: function defined on CLIENT, called on CLIENT -> no transformation
     * 5: function defined on CLIENT, called on SERVER -> transform to Meteor method call (subhog package)
     * 6: function defined on CLIENT, called by BOTH   -> combination of previous cases
     */
    function nodeifyCallExp (transpiler) {
        var node        = transpiler.node,
            actual_ins  = node.getActualIn(),
            actual_outs = node.getActualOut(),
            parent      = Ast.parent(node.parsenode, transpiler.ast),
            entryNode   = node.getEntryNode()[0],
            callargs    = 0,
            sharedcnt = servercnt = clientcnt = 0,
            transpiled, declarationnode, declarationtype;
        makeTransformer(transpiler);

        arguments = actual_ins.filter(function (a_in) {
            return nodesContains(transpiler.nodes, a_in);
        }).map(function (a_in) {
            var transpiled = Transpiler.copyTranspileObject(transpiler, a_in);
            transpiled  = Transpiler.transpile(transpiled);
            transpiler.nodes = transpiled.nodes;
            transpiler.nodes = transpiler.nodes.remove(a_in);
            return transpiled.transpiledNode;
        });

        actual_ins.map(function (a_in) {
            transpiler.nodes = transpiler.nodes.remove(a_in);
            a_in.getOutNodes(EDGES.CONTROL)
                .filter(function (n) { return n.isCallNode })
                .map(function (n) { callargs++; transpiler.nodes = transpiler.nodes.remove(n); });
            a_in.getOutNodes(EDGES.CONTROL)
                .filter(function (n) {return !n.isCallNode})
                .map(function (n) {transpiler.nodes = transpiler.nodes.remove(n); })
        });
        actual_outs.map(function (a_out) {
            transpiler.nodes = transpiler.nodes.remove(a_out);
        });

        if (Aux.isMemberExpression(Pdg.getCallExpression(node.parsenode).callee)) {
            node.getInNodes(EDGES.DATA).concat(node.getInNodes(EDGES.REMOTED))
                    .map(function(n) {
                        if (n.isStatementNode &&
                            (Aux.isVarDecl(n.parsenode) ||
                             Aux.isVarDeclarator(n.parsenode)) &&
                            n.name === Pdg.getCallExpression(node.parsenode).callee.object.name)
                        declarationnode = n;
                    })
            if (declarationnode) {
                declarationtype = declarationnode.getFType();
                if (!declarationnode.sharedcnt) {
                    declarationnode.getOutNodes(EDGES.DATA).concat(declarationnode.getOutNodes(EDGES.REMOTED))
                        .map(function (dnode) {
                            var ctype = dnode.getFType();
                            if (fTypeEquals(ctype, DNODES.SHARED)) sharedcnt++;
                            if (fTypeEquals(ctype, DNODES.SERVER)) servercnt++;
                            if (fTypeEquals(ctype, DNODES.CLIENT)) clientcnt++;
                    });
                    /* Store for later */
                    declarationnode.sharedcnt = sharedcnt;
                    declarationnode.servercnt = servercnt;
                    declarationnode.clientcnt = clientcnt;

                }
                /* used on client and server? */
                if (declarationnode.servercnt > 0 && declarationnode.clientcnt > 0) {
                    transpiler.setupNode = [NodeParse.createGetterVarDecl(declarationnode.name)];
                    transpiler.closeupNode = [NodeParse.createDataSetter(declarationnode.name, NodeParse.createIdentifier(declarationnode.name))];
                }
            }

        }

        if (node.primitive) {
            transpiler.transpiledNode = Aux.isExpStm(node.parsenode) ? node.parsenode : parent;
            return transpiler;
        }

        /* No entryNode found : can happen with library functions.
           Just return call in this case */
        if (!entryNode) {
            if (Aux.isExpStm(parent) && Aux.isCallExp(parent.expression)) {
                parent = Aux.clone(parent);
                transpiler.transpiledNode = parent;
            }
            else {
                transpiler.transpiledNode = node.parsenode;
            }
            return transpiler;
        }
        /* Perform cloud types transformations on arguments */
        if (entryNode.isServerNode()) {
            /* CASE 2 */
            if (node.isClientNode()) {
                transpiled = transpiler.transformCPS.transformCall(transpiler, false, parent);
                transpiler.nodes = transpiled[0];
                transpiler.transpiledNode = transpiled[1].parsenode;

                return transpiler;
            }
            /* CASE 1 : defined on server, called by server */
            else if(node.isServerNode()) {
                transpiler.transpiledNode = Aux.isExpStm(node.parsenode) ? node.parsenode : parent;
            }

            return transpiler;
        }
        else if (entryNode.isClientNode()) {
            /* CASE  4 : defined on client, called by client */
            if(node.isClientNode()) {
                transpiled = transpiler.transformCPS.transformCall(transpiler, false, parent);
                transpiler.nodes = transpiled[0];
                transpiler.transpiledNode= transpiled[1].parsenode;

                return transpiler;
            }
            else {
                /* CASE 5 : defined on client, called by server */
                if (node.arity && arityEquals(node.arity, ARITY.ONE)) {
                    transpiled = transpiler.transformCPS.transformReplyCall(node, transpiler.nodes, transpiler);
                    transpiler.transpiledNode = transpiled[1].parsenode;
                    return transpiler;
                }

                transpiled = NodeParse.createBroadcast();
                transpiled.setName('"' + node.name + '"');
                transpiled.addArgs(Pdg.getCallExpression(node.parsenode).arguments);              

                if (node.parsenode.handlersAsync && node.parsenode.handlersAsync.length != 0) {
                    var handlerCtr = node.parsenode.handlersAsync.length,
                        lastHandler = node.parsenode.handlersAsync[handlerCtr - 1];

                    if (transpiled.setObjectName) {
                        var proxyName = Handler.makeProxyName(lastHandler.getId());
                        transpiled.setObjectName(proxyName);
                    }

                    lastHandler.incRpcCount();
                }

                transpiler.transpiledNode = transpiled.parsenode;

                return transpiler;
            }
        }
        /* Shared function */
        else if (entryNode.isSharedNode()) {
            if (node.parsenode.leadingComment && Comments.isBlockingAnnotated(node.parsenode.leadingComment)) {
                transpiled = transformer.transformCPS.transformCall(transpiler, false, parent);
                transpiler.nodes = transpiled[0];
                transpiler.transpiledNode = transpiled[1].parsenode;
            }
            /* Called by client */
            else if (node.isClientNode() && Aux.isExpStm(parent)) {
                transpiler.transpiledNode = parent;
                transpiler.nodes = transpiler.nodes.remove(node);
            }
            /* Called by server */
            else if (node.isServerNode() && Aux.isExpStm(parent)) {
                transpiler.transpiledNode = parent;
                transpiler.nodes = transpiler.nodes.remove(node);
            } else {
                transpiler.transpiledNode= node.parsenode;
            }
            return transpiler;
        }
    }
    transformer.transformCallExp = nodeifyCallExp;


    /* Return Statement */
    transformer.transformReturnStm = JSify.transformReturnStm;


    /* If statement */
    transformer.transformIfStm = JSify.transformIfStm;

    /* For statement */
    transformer.transformForStm = JSify.transformForStm;


    function nodeifyTryStm  (transpiler) {
        var block      = [],
            node       = transpiler.node,
            blocknodes = node.getOutEdges(EDGES.CONTROL)
                             .map(function (e) {return e.to}),
            /* Nodes that are calls are have calls in them */
            callnodes  = blocknodes.filter(function (n) { return Aux.hasCallStm(n.parsenode)}),
            /* Get the actual calls */
            calls      = callnodes.flatMap(function (cn) { 
                            if (cn.isCallNode) 
                                return [cn];
                            else return cn.findCallNodes();  }),
            catches    = calls.flatMap(function (call) {
                            return call.getOutEdges(EDGES.CONTROL)
                                      .map(function (e) {return e.to})
                                      .filter(function (n) {
                                         return ! n.isExitNode && 
                                           n.parsenode && 
                                           Aux.isCatchStm(n.parsenode)})
                        }),
            handler;

        blocknodes.map(function (node) {
            if (slicedContains(sliced.nodes, node)) {
                var toTranspile = Transpiler.copyTranspileObject(transpiler, n);
                var blocknode = Transpiler.transpile(toTranspile);
                transpiler.nodes = blocknode.nodes.remove(node);
                block.push(blocknode.parsednode);
            }
        });

        catches.map(function (node) {
            if (slicedContains(sliced.nodes, node)) {
                var toTranspile = Transpiler.copyTranspileObject(transpiler, n);
                var catchnode = Transpiler.transpile(toTranspile);
                handler = catchnode.parsednode;
                transpiler.nodes = catchnode.nodes.remove(node);
            }
        });
        node.parsenode.handler = handler;
        node.parsenode.block.body = block;

        //remote try-catch if all calls are remote
        var allRemotes = block.filter(function (node){
            return node.callnode && node.callnode.edges_out.filter(function(edge){
                return edge.equalsType(EDGES.REMOTEC)
            }).length >= 1
        }).length === block.length;

        if(allRemotes){
            node.parsenode = block;
        }

        transpiler.nodes = transpiler.nodes.remove(node);
        transpiler.transpiledNode = node.parsenode;
        return transpiler;
    }

    /* Try Statement */
    transformer.transformTryStm = nodeifyTryStm;

    /* Catch Statement */
    transformer.transformCatchClause = JSify.transformCatchClause;

    /* Throw Statement */
    transformer.transformThrowStm =  JSify.transformThrowStm;


    /* Block Statement */
    transformer.transformBlockStm = JSify.transformBlockStm;


    /* Object Expression */
    transformer.transformObjectExp = JSify.transformObjectExp;


    /* New Expression */
    transformer.transformNewExp = JSify.transformNewExp;



    /* Object Property */
    transformer.transformProperty = JSify.transformProperty;

    /* Member expression */
    transformer.transformMemberExpression = JSify.transformMemberExpression;

    /* Update expression */
    transformer.transformUpdateExp = JSify.transformUpdateExp;

    function noTransformationDefined (transpiler) {
        transpiler.transpiledNode = false;
        return transpiler;
    }

    function noTransformation (transpiler) {
        transpiler.transpiledNode = transpiler.node.parsenode;
        return transpiler;
    }

    function transformActualParameter (transpiler) {
        transpiler.node.getOutNodes(EDGES.CONTROL)
            .map(function (n) {
                var transpiled = Transpiler.copyTranspileObject(transpiler, n);
                transpiled  = Transpiler.transpile(transpiled);
                transpiler.nodes = transpiled.nodes;
                transpiler.nodes = transpiler.nodes.remove(n);
            });
        transpiler.transpiledNode = transpiler.node.parsenode;
        return transpiler;
    }


    transformer.transformActualParameter = transformActualParameter;
    transformer.transformFormalParameter = noTransformationDefined;
    transformer.transformExitNode = noTransformation;

    function nodesContains (nodes, node, cps) {
        return nodes.filter(function (n) {
            return n.id === node.id;
        }).length > 0;
    }


    if (typeof module !== 'undefined' && module.exports != null) {
        EDGES = require('../PDG/edge.js').EDGES;
        nodereq = require('../PDG/node.js');
        asyncs  = require('../pre-analysis').asyncs;
        DNODES = nodereq.DNODES;
        arityEquals = nodereq.arityEquals;
        fTypeEquals = nodereq.fTypeEquals;
        ARITY = nodereq.ARITY;
        NodeParse = require('./Node_parse.js').NodeParse;
        CPSTransform = require('./CPS_transform.js').CPSTransform;
        exports.Nodeify  = transformer;
    }

    return transformer;


})()