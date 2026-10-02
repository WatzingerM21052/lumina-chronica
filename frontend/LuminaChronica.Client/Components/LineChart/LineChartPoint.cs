namespace LuminaChronica.Client.Components;

// One point of LineChart: Label is the x-axis text (e.g. "Mär"), ValueText
// the already-localized value for the tooltip and the screen-reader table.
public record LineChartPoint(string Label, double Value, string ValueText);
