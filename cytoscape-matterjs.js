;(function(){ 'use strict';

  // registers the extension on a cytoscape lib ref
  var register = function( cytoscape, Matter/*, MatterGravity*/ ){

    if( !cytoscape ){ return; } // can't register if cytoscape unspecified

    var defaults = {
      // define the default options for your layout here
      refresh: 10, // iterations until thread sends an update
      fit: true,
      gravity: -10,
      globalAirFriction: 0.25,
      clusters: [],
      mass: [],
      maxTicks: 2000,
      maxSimulationTime: 5000 // time in ms before layout bails out
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

      // matter.js aliases
      var Engine = Matter.Engine;
      var World = Matter.World;
      var Body = Matter.Body;
      var Bodies = Matter.Bodies;
      var Bounds = Matter.Bounds;
      var Events = Matter.Events;
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
      var matterNodes = [];
      var matterEdges = [];



      // +------------------------------------------------------------------------+ //
      // +-----------------ADDS NODES TO THE MATTER JS SIMULATION-----------------+ //
      // +------------------------------------------------------------------------+ //
      // +------------------------------------------------------------------------+ //

      function mapNode(nodeIn) {
        if (nodeIn.parent().length === 0) {
          var mass = 10;
          for (var j = 0; j < options.mass.length; j++) {
            if (options.mass[j].id === nodeIn.id()) {
              mass = options.mass[j].mass;
            }
          }
          var temp;
          if (nodeIn.children().length > 0) {
            temp = {
              shape: Bodies.rectangle(
                nodeIn.position().x,
                nodeIn.position().y,
                nodeIn.width(),
                nodeIn.height(),
                {
                  id: nodeIn.data().id,
                  inertia: Infinity,
                  mass: mass,
                  gravity: options.gravity,
                  frictionAir: options.globalAirFriction,
                }
              ),
              parent: nodeIn.data().parent,
              children: [],
              oldX: nodeIn.position().x,
              oldY: nodeIn.position().y
            };
            for (var j = 0; j < nodeIn.children().length; j++) {
              temp.children[j] = nodeIn.children()[j].data().id;
            }
            matterNodes.push(temp);

            World.addBody(engine.world, temp.shape);
          } else {
            temp = {
              shape:Bodies.circle(
                nodeIn.position().x,
                nodeIn.position().y,
                nodeIn.width() / 2,
                {
                  id: nodeIn.data().id,
                  inertia: Infinity,
                  mass: mass,
                  gravity: options.gravity,
                  frictionAir: options.globalAirFriction,
                }
              ),
              parent: nodeIn.data().parent,
              children: [],
              oldX: nodeIn.position().x,
              oldY: nodeIn.position().y
            };
            matterNodes.push(temp);
            World.addBody(engine.world, temp.shape);
          }
          nodeIn.scratch('matter', temp);
          temp._cyEle = nodeIn;
        }

      }

      function handleCluster( cluster ){
        var cNodes = cluster.nodes;

        if(cluster.center !== undefined) {

          var xTemp = cluster.center.x;
          var yTemp =  cluster.center.y;

          for (var j = 0; j < cNodes.length; j++) {
            var node = cNodes[j];
            for (var k = 0; k < matterNodes.length; k++) {
              if (matterNodes[k].shape.id === node) {
                World.add(world, Constraint.create({
                  bodyA: matterNodes[k].shape,
                  pointB: { x: xTemp, y: yTemp },
                  length: cluster.distanceFromCluster,
                  stiffness: cluster.elasticityToCluster
                }));
              }
            }
          }

        } else if(cluster.random !== undefined) {

          var xTemp = Math.random()*(cluster.random.xMax-cluster.random.xMin)+cluster.random.xMin;
          var yTemp = Math.random()*(cluster.random.yMax-cluster.random.yMin)+cluster.random.yMin;

          for (var j = 0; j < cNodes.length; j++) {
            var node = cNodes[j];

            for (var k = 0; k < matterNodes.length; k++) {
              if (matterNodes[k].shape.id === node) {
                World.add(world, Constraint.create({
                  bodyA: matterNodes[k].shape,
                  pointB: { x: xTemp, y: yTemp },
                  length: cluster.distanceFromCluster,
                  stiffness: cluster.elasticityToCluster
                }));
              }
            }
          }

        } else {

          var xAvg = 0;
          var yAvg = 0;
          for (var j = 0; j < cNodes.length; j++) {
            var n = cNodes[j];
            var p = n.position();
            xAvg += p.x;
            yAvg += p.y;
          }

          for (var j = 0; j < cNodes.length; j++) {
            var node = cNodes[j];

            for (var k = 0; k < matterNodes.length; k++) {
              if (matterNodes[k].shape.id === node) {
                World.add(world, Constraint.create({
                  bodyA: matterNodes[k].shape,
                  pointB: { x: xAvg/cNodes.length, y: yAvg/cNodes.length },
                  length: cluster.distanceFromCluster,
                  stiffness: cluster.elasticityToCluster
                }));
              }
            }
          }

        }
      }

      function mapNodes(nodesIn) {
        for (var i = 0; i < nodesIn.length; i++) {
          mapNode(nodesIn[i]);
        }

        var clusters = options.clusters;
        for( var i = 0; i < clusters.length; i++ ){
          handleCluster( clusters[i] );
        }

        return 0;
      }



      // +------------------------------------------------------------------------+ //
      // +----------------ADDS EDGES TO THE MATTER JS SIMULATION------------------+ //
      // +------------------------------------------------------------------------+ //
      // +------------------------------------------------------------------------+ //

      // TODO use same approach for edge <=> matter w/ scratch & ref
      function mapEdges(edgesIn){
        for (var i = 0; i < edgesIn.length; i++) {

          var tempSource;
          var tempTarget;

          var temp = Constraint.create({
            bodyA: edgesIn[i].source().scratch('matter').shape,
            bodyB: edgesIn[i].target().scratch('matter').shape,
            length: 400,
            stiffness: 0.05,
          });
          matterEdges.push(temp);
          World.add(world, matterEdges[i]);
          edgesIn[i].scratch('matter', temp);
        }
      }




      // +------------------------------------------------------------------------+ //
      // +-------------EVENT MANAGEMENT OF THE MATTER JS SIMULATION---------------+ //
      // +------------------------------------------------------------------------+ //
      // +------------------------------------------------------------------------+ //

      mapNodes(nodes);
      mapEdges(edges);

      var getPos = function (i, ele) {
        if (ele.parent().length !== 0) {
          for (var j = 0; j < matterNodes.length; j++) {
            if (matterNodes[j].shape.id === ele.parent().id()) {
              return {
                x: (matterNodes[j].shape.position.x - matterNodes[j].oldX) + nodes[i].position().x,
                y: (matterNodes[j].shape.position.y - matterNodes[j].oldY) + nodes[i].position().y
              };
            }
          }
        } else {
          ele.scratch('matter').oldX = ele.position().x;
          ele.scratch('matter').oldY = ele.position().y;
          return {
            x: ele.scratch('matter').shape.position.x,
            y: ele.scratch('matter').shape.position.y
          };
        }
      };

      var tickCount = 0;
      var startTime = Date.now();
      Events.on(runner, 'afterTick', function () {
        var now = Date.now();
        tickCount++;

        if ((tickCount % options.refresh) === 0) {
          //console.log(matterNodes);
          nodes.layoutPositions(layout, options, getPos);
        }

        if (tickCount >= options.maxTicks || now - startTime >= options.maxSimulationTime) {
          Runner.stop(runner);
        }
      });

      Runner.start(runner, engine);

      return this;
    };

    cytoscape( 'layout', 'matterjs', Layout ); // register with cytoscape.js

  };

  if( typeof module !== 'undefined' && module.exports ){ // expose as a commonjs module
    module.exports = register; // TODO fn w/ req manfred TODO
  } else if( typeof define !== 'undefined' && define.amd ){ // expose as an amd/requirejs module
    define('cytoscape-matterjs', function(){
      return register;
    });
  }
  if( typeof cytoscape !== 'undefined' && typeof Matter !== 'undefined'/* && typeof MatterGravity !== 'undefined'*/){ // expose to global cytoscape (i.e. window.cytoscape)
    register( cytoscape, Matter/*, MatterGravity */);
  }

})();
