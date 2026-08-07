// Shared across service files whose routes are handled together in one
// route file (routes/projects.ts: projects + characters + later
// Worldbuilding sub-resources) -- a resource-specific NotFoundError defined
// separately per service file (the shelfService.ts/bookService.ts pattern)
// would make an `instanceof` check in a shared route handler only match
// whichever service's class happened to be imported there.
export class NotFoundError extends Error {}
