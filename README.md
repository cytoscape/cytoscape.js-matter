cytoscape-matterjs
================================================================================


## Description




## Dependencies

 * Cytoscape.js 2.7.15
 * MatterJS 0.12.0


## Usage instructions

Download the library:
 * via npm: `npm install cytoscape-matterjs`,
 * via bower: `bower install cytoscape-matterjs`, or
 * via direct download in the repository (probably from a tag).

`require()` the library as appropriate for your project:

CommonJS:
```js
var cytoscape = require('cytoscape');
var matterjs = require('cytoscape-matterjs');

matterjs( cytoscape ); // register extension
```

AMD:
```js
require(['cytoscape', 'cytoscape-matterjs'], function( cytoscape, matterjs ){
  matterjs( cytoscape ); // register extension
});
```

Plain HTML/JS has the extension registered for you automatically, because no `require()` is needed.


## API

Please briefly describe your API here:

```js
cy.matterjs({
  refreshInterval: 16, // in ms
  refreshIterations: 10, // iterations until thread sends an update
  fit: true,
  gravity: -10, // the force each node applies to others
  globalAirFriction: 0.25, // set the air friction for the simulation
  clusters: [], // specifies groups of nodes that will be attracted to an average point between them
  mass: [], // maps a node id to a mass value for use in the simulation with a {id: 'IDENTIFICATION', mass: 15}. If a mass is not specified for a particular node the layout assigns it a mass of 10
  tickTimeout: 2000, // the number of ticks before the simulation times out
  updateOn: 1, // the number of ticks that pass before a graphical update. The default is 1, and so the graphics update every tick
  depthRestrict: true,
});
```

Or maybe if you have a collection extension:

```js
cy.elements().test({
  foo: 'bar', // some option that does this
  baz: 'bat' // some options that does that
  // ... and so on
});
```


## Publishing instructions

This project is set up to automatically be published to npm and bower.  To publish:

1. Set the version number environment variable: `export VERSION=1.2.3`
1. Publish: `gulp publish`
1. If publishing to bower for the first time, you'll need to run `bower register cytoscape-matterjs https://github.com/cytoscape-MatterJS.git`
