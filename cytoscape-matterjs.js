;(function(){ 'use strict';

  // registers the extension on a cytoscape lib ref
  var register = function( cytoscape, Matter ){

    if( !cytoscape ){ return; } // can't register if cytoscape unspecified

    // TODO options for each force value (fns)
    var defaults = {
      // define the default options for your layout here
      refresh: 10, // iterations until thread sends an update
      fit: true,
      displayMatter: false, // flag that allows the user to see the MatterJS sim in the background
      gravity: function( node ){ return -1; }, // value or function that allows the user to set the repellant force for each node
      airFriction: function( node ){ return 0.25; }, // value or function that allows the user to set the air friction for each node
      floorSpeed: 0.05, // minimum average speed of the simulation
      speedHistorySize: 30, // number of average speeds to save. The current average speed will be compared to the last saved average to determine if the graph has begun to stagnate. This is to prevent cases where graphs stop rearranging themselves and end up rotating endlessly.
      floorSpeedDecrease: 0.00001, // minimum absolute difference between the last saved average and the most recent average before the algorithm terminates
      length: function( edge ){ return 60; }, // value or function that returns a value for the length the edge tends towards
      stiffness: function( edge ){ return 0.01; }, // value or function that returns a value for edge stiffness force
      childClusterDistance: function( node ){ return 60; }, // value or function that returns a value for the distance from the parent that a node tends towards
      childClusterStiffness: function( node ){ return 0.01; }, // value or function that returns a value for the elasticity of the invisible edge holding a child to it's parent
      mass: function(node){return 10;}, // value or function that returns a value for the mass for a node
      maxTicks: 5000, // in-simulation ticks before layout stops itself
      maxSimulationTime: 5000 // time in ms before layout bails out
    };

    function isFunction( f ){
      return typeof f === 'function';
    }

    var getOptVal = function( val, ele ){
      if( isFunction(val) ){
        return val( ele );
      } else {
        return val;
      }
    };

    var extend = Object.assign || function( tgt ){
      for( var i = 1; i < arguments.length; i++ ){
        var obj = arguments[i];

        for( var k in obj ){ tgt[k] = obj[k]; }
      }

      return tgt;
    };

    function Layout( options ){
      this.options = extend( {}, defaults, options );
    }

    Layout.prototype.run = function () {
      // cytoscape.js variables
      var layout = this;
      var options = this.options;
      var cy = options.cy;
      var eles = options.eles;
      var nodes = eles.nodes();
      var edges = eles.edges();
      var nonParentNodes = nodes.stdFilter(function( node ){ return !node.isParent(); });

      // matter.js aliases
      var Engine = Matter.Engine;
      var World = Matter.World;
      var Body = Matter.Body;
      var Bodies = Matter.Bodies;
      var Bounds = Matter.Bounds;
      var Events = Matter.Events;
      var Render = Matter.Render;
      var Runner = Matter.Runner;
      var Query = Matter.Query;
      var Composite = Matter.Composite;
      var Constraint = Matter.Constraint;
      var Common = Matter.Common;
      var Vertices = Matter.Vertices;

      // matter.js variables
      var engine = Engine.create();
      var world = engine.world;
      var runner = Runner.create();

      Matter.use('matter-attractors', 'matter-gravity');
      world.gravity.scale = 0;

      // layout specific variables
      var matterNodes = {}; // object with the nodes used in the MatterJS simulation
      var matterEdges = {}; // object with the edges used in the MatterJS simulation
      var tickCount = 0; // number of ticks the simulation has completed
      var startTime = Date.now(); // time simulation started at
      var averageSpeedList = []; // list of the last few average speeds of the nodes in the graph

      // +------------------------------------------------------------------------+ //
      // +----------------MATTERJS RENDERER FOR DEBUGGING PURPOSES----------------+ //
      // +------------------------------------------------------------------------+ //

      if(options.displayMatter){
        var render = Render.create({
          element: document.body,
          engine: engine,
          options: {
            width: Math.min(document.documentElement.clientWidth, 800),
            height: Math.min(document.documentElement.clientHeight, 600),
            showAngleIndicator: true
          }
        });
        Render.run(render);
      }

      // +------------------------------------------------------------------------+ //
      // +-----------------ADDS NODES TO THE MATTER JS SIMULATION-----------------+ //
      // +------------------------------------------------------------------------+ //

      function getNode(nodeIn){
        if(nodeIn === undefined){
          return undefined;
        }else if (matterNodes[nodeIn.data().id] === undefined) {
          var mNode;
          if(nodeIn.children().length !== 1){ // creates a new parent node that the child nodes will be attached to
            mNode = {
              shape:Bodies.circle(
                nodeIn.position().x,
                nodeIn.position().y,
                30,
                {
                  id: nodeIn.data().id,
                  inertia: Infinity,
                  mass: getOptVal( options.mass, nodeIn ),
                  gravity: getOptVal( options.gravity, nodeIn ),
                  frictionAir: getOptVal( options.airFriction, nodeIn ),
                }
              ),
              parent: nodeIn.data().parent,
              children: [],
              oldX: nodeIn.position().x,
              oldY: nodeIn.position().y
            };
            World.addBody(engine.world, mNode.shape);
            mNode._cyEle = nodeIn;
            matterNodes[nodeIn.data().id] = {node:mNode, children:nodeIn.children().length};
          }else{ // recursively returns the child of a node with only one child in order to prevent useless parent nodes that clutter the simulation
            mNode = getNode(nodeIn.children()[0]);
          }
          nodeIn.scratch('matter', mNode);
          return mNode;
        } else { // if the desired matter node has already been created it is returned
          return matterNodes[nodeIn.data().id].node;
        }
      }

      function mapNode(nodeIn) {
        var tempMatterNode = getNode(nodeIn);
        var tempMatterParent = getNode(nodeIn._private.parent);
        if(tempMatterParent !== undefined){ // attaches a node's matter representation to it's parent's representation
          var compoundNodeEdge = Constraint.create({
            bodyA: tempMatterNode.shape,
            bodyB: tempMatterParent.shape,
            length: getOptVal( options.childClusterDistance, nodeIn ),
            stiffness: getOptVal( options.childClusterStiffness, nodeIn ),
          });
          tempMatterParent.children.push(tempMatterNode);
          matterEdges[tempMatterNode.shape.id + '-' + tempMatterParent.shape.id] = compoundNodeEdge;
          nodeIn.scratch('matterParentLink', compoundNodeEdge);
          World.add(world, compoundNodeEdge);
        }
        return 0;
      }

      function mapNodes(nodesIn) {
        for (var i = 0; i < nodesIn.length; i++) {
          mapNode(nodesIn[i]);
        }
        return 0;
      }

      // +------------------------------------------------------------------------+ //
      // +----------------ADDS EDGES TO THE MATTER JS SIMULATION------------------+ //
      // +------------------------------------------------------------------------+ //

      function mapEdge(edgeIn){
        var tempSource;
        var tempTarget;

        var src = edgeIn.source();
        var tgt = edgeIn.target();
        var matterEdge = Constraint.create({
          bodyA: src.scratch('matter').shape,
          bodyB: tgt.scratch('matter').shape,
          length: getOptVal( options.length, edgeIn ),
          stiffness: getOptVal( options.stiffness, edgeIn ),
        });
        matterEdges[src.data().id + '-' + tgt.data().id] = matterEdge;
        World.add(world, matterEdge);
        edgeIn.scratch('matter', matterEdge);
      }

      function mapEdges(edgesIn){
        for(var i = 0; i < edgesIn.length; i++){
          mapEdge(edgesIn[i]);
        }
      }

      // +------------------------------------------------------------------------+ //
      // +-------------EVENT MANAGEMENT OF THE MATTER JS SIMULATION---------------+ //
      // +------------------------------------------------------------------------+ //

      mapNodes(nodes);
      mapEdges(edges);

      var getPos = function ( ele, i) {
        var p = ele.scratch('matter').shape.position;
        return {
          x: p.x,
          y: p.y
        };
      };

      function computeAverageSpeed(){
        var averageSpeed = 0;
        for(var i = 0; i < nodes.length; i++){
          averageSpeed += Math.sqrt(Math.pow(nodes[i].scratch('matter').shape.velocity.x, 2) + Math.pow(nodes[i].scratch('matter').shape.velocity.y, 2));
        }
        averageSpeed = averageSpeed/nodes.length;
        averageSpeedList.push(averageSpeed);
        if(averageSpeedList.length > options.speedHistorySize){
          averageSpeedList.shift();
        }
      }

      Events.on(runner, 'afterTick', function () {
        var now = Date.now();
        var duration = now - startTime;

        tickCount++;

        if ((tickCount % options.refresh) === 0) {
          nonParentNodes.positions(getPos);
        }

        computeAverageSpeed();

        if (tickCount >= options.maxTicks || duration >= options.maxSimulationTime) {
          Runner.stop(runner);
        }else if(averageSpeedList[options.speedHistorySize-1] < options.floorSpeed){
          Runner.stop(runner);
        }else if(Math.abs(averageSpeedList[0] - averageSpeedList[options.speedHistorySize-1]) < options.floorSpeedDecrease){
          Runner.stop(runner);
        }
      });

      Runner.start(runner, engine);

      return this;
    };

    cytoscape( 'layout', 'matterjs', Layout ); // register with cytoscape.js

  };

  if( typeof module !== 'undefined' && module.exports ){ // expose as a commonjs module
    module.exports = function( cytoscape, Matter ){
      register( cytoscape, Matter || require('matter-js') );
    };
  } else if( typeof define !== 'undefined' && define.amd ){ // expose as an amd/requirejs module
    define('cytoscape-matterjs', function(){
      return register;
    });
  }
  if( typeof cytoscape !== 'undefined' && typeof Matter !== 'undefined'){ // expose to global cytoscape (i.e. window.cytoscape)
    register( cytoscape, Matter );
  }

})();
