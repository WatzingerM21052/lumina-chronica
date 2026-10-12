// Reports a shelf's inner width to .NET so ClassicShelf can break its
// books into planks (the layout itself lives in C#: ShelfLineLayout).
const observers = new WeakMap();

export function observeWidth(element, dotNetRef, method) {
    let last = -1;
    let frame = 0;
    const report = () => {
        frame = 0;
        const style = getComputedStyle(element);
        const width = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        if (Math.abs(width - last) < 1) return;
        last = width;
        dotNetRef.invokeMethodAsync(method, width);
    };
    const observer = new ResizeObserver(() => {
        if (!frame) frame = requestAnimationFrame(report);
    });
    observer.observe(element);
    observers.set(element, observer);
    report();
}

export function disconnect(element) {
    observers.get(element)?.disconnect();
    observers.delete(element);
}
