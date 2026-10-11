import 'node:process';
import { app } from './app.js';
import { advanceRuns } from './lib/runs.js';

advanceRuns(); // pick up any run that was waiting for a machine when the server last stopped
const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));
