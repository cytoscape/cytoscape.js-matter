;(function(){ 'use strict';

  // registers the extension on a cytoscape lib ref
  var register = function( cytoscape ){

    if( !cytoscape ){ return; } // can't register if cytoscape unspecified

    var defaults = {
      // define the default options for your layout here
      refreshInterval: 16, // in ms
      refreshIterations: 10, // iterations until thread sends an update
      fit: true,
      gravity: -10,
      globalAirFriction: 0.25,
      clusters: [],
      mass: [],
      tickTimeout: 2000,
      updateOn: 1,
      depthRestrict: true,
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

      Matter.use('matter-gravity');
      world.gravity.scale = 0;

      // layout specific variables
      var matterNodes = [];
      var matterEdges = [];
      //var matterCenterSprings = [{ id: 'top', children: [] }];

// +------------------------------------------------------------------------+ //
// +-----------------ADDS NODES TO THE MATTER JS SIMULATION-----------------+ //
// +------------------------------------------------------------------------+ //
// +------------------------------------------------------------------------+ //

      /*function addToCenterSprings(i) {
        if (matterNodes[i].parent !== undefined) {
          for (var j = 0; j < matterCenterSprings.length; j++) {
            if (matterCenterSprings[j].id === matterNodes[i].parent) {
              matterCenterSprings[j].children.push({ id: matterNodes[i].shape.id, x: matterNodes[i].shape.position.x, y: matterNodes[i].shape.position.y });
            }
          }
        } else {
          for (var j = 0; j < matterCenterSprings.length; j++) {
            if (matterCenterSprings[j].id === 'top') {
              matterCenterSprings[j].children.push({ id: matterNodes[i].shape.id, x: matterNodes[i].shape.position.x, y: matterNodes[i].shape.position.y });
            }
          }
        }
      }*/

      function mapNode(nodeIn, currentMatterNode) {
        if (nodeIn.parent().length === 0) {
          var mass = 10;
          for (var j = 0; j < options.mass.length; j++) {
            if (options.mass[j].id === nodeIn.id()) {
              mass = options.mass[j].mass;
              console.log(options.mass[j]);
            }
          }
          if (nodeIn.children().length > 0) {
            matterNodes.push({
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
            });

            World.addBody(engine.world, matterNodes[currentMatterNode].shape);
            //matterCenterSprings.push({ id: matterNodes[currentMatterNode].shape.id, children: [] });

            //addToCenterSprings(currentMatterNode);
          } else {
            matterNodes.push({
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
            });
            console.log(matterNodes[currentMatterNode]);
            World.addBody(engine.world, matterNodes[currentMatterNode].shape);
            //addToCenterSprings(currentMatterNode);
          }
          for (var j = 0; j < nodeIn.children().length; j++) {
            matterNodes[currentMatterNode].children[j] = nodeIn.children()[j].data().id;
          }
          currentMatterNode++;
        }
        return currentMatterNode;
      }

      function handleClusters(){
        var xAvg = 0;
        var yAvg = 0;
        for (var j = 0; j < options.clusters[i].nodes.length; j++) {
          for (var k = 0; k < nodes.length; k++) {
            if (nodes[k].data().id === options.clusters[i].nodes[j]) {
              if(nodes[k].position() !== undefined){
                xAvg += nodes[k].position().x;
                yAvg += nodes[k].position().y;
              }
            }
          }
        }
        for (var j = 0; j < options.clusters[i].nodes.length; j++) {
          for (var k = 0; k < matterNodes.length; k++) {
            if (matterNodes[k].shape.id === options.clusters[i].nodes[j]) {
              World.add(world, Constraint.create({
                bodyA: matterNodes[k].shape,
                pointB: { x: xAvg/options.clusters[i].nodes.length, y: yAvg/options.clusters[i].nodes.length },
                length: options.clusters[i].distanceFromCluster,
                stiffness: options.clusters[i].elasticityToCluster
              }));
            }
          }
        }
      }

      function mapNodes(nodesIn) {
        var currentMatterNode = 0;
        for (var i = 0; i < nodesIn.length; i++) {
          console.log(nodesIn[i]);
          currentMatterNode = mapNode(nodesIn[i], currentMatterNode);
        }
        for (var i = 0; i < options.clusters.length; i++) {
          handleClusters();
        }
        return 0;
      }
      mapNodes(nodes);

// +------------------------------------------------------------------------+ //
// +----------------ADDS EDGES TO THE MATTER JS SIMULATION------------------+ //
// +------------------------------------------------------------------------+ //
// +------------------------------------------------------------------------+ //

      function mapEdges(edgesIn){
        for (var i = 0; i < edgesIn.length; i++) {
          var tempSource;
          var tempTarget;
          for (var j = 0; j < matterNodes.length; j++) {
            if (matterNodes[j].shape.id === edgesIn[i].data().source) {
              tempSource = matterNodes[j].shape;
              for (j; j < matterNodes.length; j++) {
                if (matterNodes[j].shape.id === edgesIn[i].data().target) {
                  tempTarget = matterNodes[j].shape;
                }
              }
            } else if (matterNodes[j].shape.id === edgesIn[i].data().target) {
              tempTarget = matterNodes[j].shape;
              for (j; j < matterNodes.length; j++) {
                if (matterNodes[j].shape.id === edgesIn[i].data().source) {
                  tempSource = matterNodes[j].shape;
                }
              }
            }
          }
          if (tempSource !== undefined && tempTarget !== undefined) {
            matterEdges.push(Constraint.create({
              bodyA: tempSource,
              bodyB: tempTarget,
              length: 400,
              stiffness: 0.05,
            }));
            World.add(world, matterEdges[i]);
          }
        }
      }
      mapEdges(edges);

// +------------------------------------------------------------------------+ //
// +-------------EVENT MANAGEMENT OF THE MATTER JS SIMULATION---------------+ //
// +------------------------------------------------------------------------+ //
// +------------------------------------------------------------------------+ //

      Runner.start(runner, engine);

      var objectsBefore = [];
      var objectsAfter = [];
      var tempWorld;

      var tickCount = 0;
      Events.on(runner, 'afterTick', function () {
        tickCount++;
        if ((tickCount % options.updateOn) === 0) {
          //console.log(matterNodes);
          nodes.layoutPositions(layout, options, getPos);
        }
        if (tickCount >= options.tickTimeout) {
          Runner.stop(runner);
        }
      });

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
          for (var j = 0; j < matterNodes.length; j++) {
            if (matterNodes[j].shape.id === nodes[i].id()) {
              //console.log(nodes[i].position());
              matterNodes[j].oldX = nodes[i].position().x;
              matterNodes[j].oldY = nodes[i].position().y;
              console.log(matterNodes[j]);
              return {
                x: matterNodes[j].shape.position.x,
                y: matterNodes[j].shape.position.y
              };
            }
          }
        }
      };
      return this;
    };

    cytoscape( 'layout', 'matterjs', Layout ); // register with cytoscape.js

  };

  if( typeof module !== 'undefined' && module.exports ){ // expose as a commonjs module
    module.exports = register;
  }

  if( typeof define !== 'undefined' && define.amd ){ // expose as an amd/requirejs module
    define('cytoscape-matterjs', function(){
      return register;
    });
  }

  if( typeof cytoscape !== 'undefined' ){ // expose to global cytoscape (i.e. window.cytoscape)
    register( cytoscape );
  }

})();
