;(function(){ 'use strict';

  // registers the extension on a cytoscape lib ref
  var register = function( cytoscape, Matter ){

    if( !cytoscape ){ return; } // can't register if cytoscape unspecified

    // TODO options for each force value (fns)
    var defaults = {
      // define the default options for your layout here
      refresh: 10, // iterations until thread sends an update
      fit: true,
      displayMatter: false,
      gravity: -1,
      globalAirFriction: 0.25,
      floorSpeed: 0.05,
      floorSpeedDecrease: 0.0001,
      length: function( edge ){ return 60; },
      stiffness: function( edge ){ return 0.01; }, // value or function that returns a value for edge stiffness force
      childClusterDistance: function( node ){ return 60; },
      childClusterStiffness: function( node ){ return 0.01; },
      mass: function(node){return 10;},
      maxTicks: 5000,
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
      var matterNodes = {};
      var matterEdges = {};
      var tickCount = 0;
      var startTime = Date.now();
      var averageSpeedList = [];
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
        Runner.run(runner,engine);
      }

      // +------------------------------------------------------------------------+ //
      // +-----------------ADDS NODES TO THE MATTER JS SIMULATION-----------------+ //
      // +------------------------------------------------------------------------+ //

      function getNode(nodeIn){
        if(nodeIn === undefined){
          return undefined;
        }else if (matterNodes[nodeIn.data().id] === undefined) {
          var mNode;
          if(nodeIn.children().length !== 1){
            mNode = {
              shape:Bodies.circle(
                nodeIn.position().x,
                nodeIn.position().y,
                30,
                {
                  id: nodeIn.data().id,
                  inertia: Infinity,
                  mass: getOptVal( options.mass, nodeIn ),
                  gravity: options.gravity,
                  frictionAir: options.globalAirFriction,
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
          }else{
            mNode = getNode(nodeIn.children()[0]);
          }
          nodeIn.scratch('matter', mNode);
          return mNode;
        } else {
          return matterNodes[nodeIn.data().id].node;
        }
      }

      function mapNode(nodeIn) {
        var tempMatterNode = getNode(nodeIn);
        var tempMatterParent = getNode(nodeIn._private.parent);
        if(tempMatterParent !== undefined){
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
        if(averageSpeedList.length > 5){
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
        }else if(averageSpeedList[4] < options.floorSpeed){
          Runner.stop(runner);
        }else if(Math.abs(averageSpeedList[0] - averageSpeedList[4]) < options.floorSpeedDecrease){
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
      register( cytoscape, Matter || require('matter-js') ); // TODO npm module name of matter?
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
