// Placeholder until Task 4: an empty, transparent scene object with the
// room interface, so the component can be wired and tested end to end.
export async function createScene() {
    const noop = () => {};
    return { update: noop, focusBook: noop, pickBook: noop, goTo: noop, goHome: noop, dispose: noop };
}
