// The dev server with React's production build (`npm run dev:fast`).
//
// React's development build records a stack trace for every element it creates, and the 3D figures are some hundreds of elements each, redrawn every frame of a
// shot: a figure costs 30 to 70 ms in the dev build and about 1 to 2 ms in the production one, so a fight in `npm run dev` runs at a few frames a second even
// where the shipped game is smooth. This starts the same dev server (files served as they are, the page reloading when one changes) with NODE_ENV set to
// production before Vite starts, so the pre-bundled React is the production one. The price: no React Fast Refresh (a change reloads the whole page, and the
// state in it is lost) and none of React's development warnings. Use `npm run dev` to work on the code and this to judge how it runs.
process.env.NODE_ENV = "production";
const { createServer } = await import("vite");
const server = await createServer();
await server.listen();
server.printUrls();
