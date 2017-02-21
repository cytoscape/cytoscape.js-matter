;(function(){ 'use strict';

  // registers the extension on a cytoscape lib ref
  var register = function( cytoscape ){

    if( !cytoscape ){ return; } // can't register if cytoscape unspecified

    var defaults = {
      // define the default options for your layout here
      refreshInterval: 16, // in ms
      refreshIterations: 10, // iterations until thread sends an update
      fit: true,
      preset: undefined,
      gravity: -10,
      globalAirFriction: 0.25,
      clusters: [],
      mass: [],
      tickTimeout: 2000,
      rescaleOn: 1,
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
      var Render = Matter.Render;
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
      var render = Render.create({
        element: document.body,
        engine: engine,
        width: 2400,
        height: 2400
      });
      var world = engine.world;
      var runner = Runner.create();

      Matter.use('matter-gravity');
      world.gravity.scale = 0;

      // layout specific variables
      var matterNodes = [];
      var matterEdges = [];
      var matterCenterSprings = [{ id: 'top', children: [] }];

// +------------------------------------------------------------------------+ //
// +-----------------ADDS NODES TO THE MATTER JS SIMULATION-----------------+ //
// +------------------------------------------------------------------------+ //
// +------------------------------------------------------------------------+ //

      function addToCenterSprings(i) {
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
      }

      function mapNodes(nodesIn) {
        var currentMatterNode = 0;
        for (var i = 0; i < nodesIn.length; i++) {
          if (nodesIn[i].parent().length === 0) {
            if (nodesIn[i].children().length > 0) {

              var mass = 10;
              for (var j = 0; j < options.mass.length; j++) {
                if (options.mass[j].id === nodesIn[i].id()) {
                  mass = options.mass[j].mass;
                  console.log(options.mass[j].id);
                }
              }

              matterNodes.push({
                shape: Bodies.rectangle(
                  nodesIn[i].position().x,
                  nodesIn[i].position().y,
                  nodesIn[i].width(),
                  nodesIn[i].height(),
                  {
                    id: nodesIn[i].data().id,
                    inertia: Infinity,
                    mass: mass,
                    gravity: options.gravity,
                    frictionAir: options.globalAirFriction,
                    render: {
                      strokeStyle: Common.shadeColor('#4ECDC4', -20),
                      fillStyle: '#4ECDC4',
                    },
                  }
                ),
                parent: nodesIn[i].data().parent,
                children: [],
                oldX: nodesIn[i].position().x,
                oldY: nodesIn[i].position().y
              });

              World.addBody(engine.world, matterNodes[currentMatterNode].shape);
              matterCenterSprings.push({ id: matterNodes[currentMatterNode].shape.id, children: [] });

              addToCenterSprings(currentMatterNode);
            } else {
              matterNodes.push({
                shape:Bodies.circle(
                  nodesIn[i].position().x,
                  nodesIn[i].position().y,
                  nodesIn[i].width() / 2,
                  {
                    id: nodesIn[i].data().id,
                    inertia: Infinity,
                    mass: 10,
                    gravity: options.gravity,
                    frictionAir: options.globalAirFriction,
                    render: {
                      strokeStyle: Common.shadeColor('#4ECDC4', -20),
                      fillStyle: '#4ECDC4',
                    }
                  }
                ),
                parent: nodesIn[i].data().parent,
                children: [],
                oldX: nodesIn[i].position().x,
                oldY: nodesIn[i].position().y
              });
              World.addBody(engine.world, matterNodes[currentMatterNode].shape);
              addToCenterSprings(currentMatterNode);
            }
            for (var j = 0; j < nodesIn[i].children().length; j++) {
              matterNodes[currentMatterNode].children[j] = nodesIn[i].children()[j].data().id;
            }
            currentMatterNode++;
          }
        }
        var xAvg = 0;
        var yAvg = 0;
        for (var i = 0; i < options.clusters.length; i++) {
          xAvg = 0;
          yAvg = 0;
          for (var j = 0; j < options.clusters[i].nodes.length; j++) {
            for (var k = 0; k < nodes.length; k++) {
              if (nodes[k].data().id === options.clusters[i].nodes[j]) {
                xAvg += nodes[k].position().x;
                yAvg += nodes[k].position().y;
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
              matterNodes[j].oldX = nodes[i].position().x;
              matterNodes[j].oldY = nodes[i].position().y;
              return {
                x: matterNodes[j].shape.position.x,
                y: matterNodes[j].shape.position.y
              };
            }
          }
        }
      };
      return this; // or...

      // continuous/asynchronous layouts need to do things manually:
      // (this example uses a thread, but you could use a fabric to get even
      // better performance if your algorithm allows for it)

      var thread = this.thread = cytoscape.thread();
      thread.require(getPos, 'getPos');

      // to indicate we've started
      layout.trigger('layoutstart');

      // for thread updates
      var firstUpdate = true;
      var id2pos = {};
      var updateTimeout;

      // update node positions
      var update = function(){
        nodes.positions(function( i, node ){
          return id2pos[ node.id() ];
        });

        // maybe we fit each iteration
        if( options.fit ){
          cy.fit( options.padding );
        }

        if( firstUpdate ){
          // indicate the initial positions have been set
          layout.trigger('layoutready');
          firstUpdate = false;
        }
      };

      // update the node positions when notified from the thread but
      // rate limit it a bit (don't want to overwhelm the main/ui thread)
      thread.on('message', function( e ){
        var nodeJsons = e.message;
        nodeJsons.forEach(function( n ){ id2pos[n.data.id] = n.position; });

        if( !updateTimeout ){
          updateTimeout = setTimeout( function(){
            update();
            updateTimeout = null;
          }, options.refreshInterval );
        }
      });

      // we want to keep the json sent to threads slim and fast
      var eleAsJson = function( ele ){
        return {
          data: {
            id: ele.data('id'),
            source: ele.data('source'),
            target: ele.data('target'),
            parent: ele.data('parent')
          },
          group: ele.group(),
          position: ele.position()

          // maybe add calculated data for the layout, like edge length or node mass
        };
      };

      // data to pass to thread
      var pass = {
        eles: eles.map( eleAsJson ),
        refreshIterations: options.refreshIterations
        // maybe some more options that matter to the calculations here ...
      };

      // then we calculate for a while to get the final positions
      thread.pass( pass ).run(function( pass ){
        var getPos = _ref_('getPos');
        var broadcast = _ref_('broadcast');
        var nodeJsons = pass.eles.filter(function(e){ return e.group === 'nodes'; });

        console.log(pass.eles);
        // calculate for a while (you might use the edges here)
        for( var i = 0; i < 100000; i++ ){
          nodeJsons.forEach(function( nodeJson, j ){
            nodeJson.position = getPos( j, nodeJson );
          });

          if( i % pass.refreshIterations === 0 ){ // cheaper to not broadcast all the time
            broadcast( nodeJsons ); // send new positions outside the thread
          }
        }
      }).then(function(){
        // to indicate we've finished
        layout.trigger('layoutstop');
      });

      return this; // chaining
    };

    Layout.prototype.stop = function(){
      // continuous/asynchronous layout may want to set a flag etc to let
      // run() know to stop

      if( this.thread ){
        this.thread.stop();
      }
      console.log('asdf');
      this.trigger('layoutstop');

      return this; // chaining
    };

    Layout.prototype.destroy = function(){
      // clean up here if you create threads etc

      if( this.thread ){
        this.thread.stop();
      }

      return this; // chaining
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
