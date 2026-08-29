# dnd-wilderweb

A small toolkit for running D&D wilderness hexcrawls.

## Usage

```js
import { rollEncounter, hexDistance } from "./src/wilderweb.js";

rollEncounter("forest"); // e.g. "owlbear"
hexDistance({ q: 0, r: 0 }, { q: 2, r: -1 }); // 2
```

## Development

Run the tests:

```bash
npm test
```
