namespace LuminaChronica.Client.Models;

public enum ShelfSectionKind { Recent, Genre, NoGenre }

// One compartment of the shelf styles (spec 2026-10-11 §2): "Zuletzt
// gelesen", one per genre, "Ohne Genre". Progress (book id -> percent) is
// only set on the Recent compartment.
public record ShelfSection(string Label, ShelfSectionKind Kind, List<Book> Books, IReadOnlyDictionary<int, double>? Progress = null);
