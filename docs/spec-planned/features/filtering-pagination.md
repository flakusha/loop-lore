# Filtering and Pagination Improvements

## Combined Filter Support

### Current State

- HTMX active search on gallery/characters/worlds
- Single filter per view

### Proposed

- Multiple filters combined with AND logic
- Filter chips show active filters

### Filter Combinations

?tags=character&tags=landscape&type=image&created_after=2024-01-01

## Search Priority

### Exact Match First

1. Exact name matches
2. Tag matches
3. Fuzzy content matches

### Sorting Algorithm

```
score = exact_name * 100 + tag_match * 50 + fuzzy * 1 + recency_bonus
```

## Pagination Improvements

### Current

- Infinite scroll via IntersectionObserver

### Proposed

- Cursor-based pagination for large datasets
- Load more button as fallback
- Max page size configurable (default 50)
- Separate count query to avoid DB overload

## API Endpoints

```
GET /api/gallery?tags=character&tags=landscape&page=cursor&limit=50
Response: { items: [...], next_cursor: "...", total: 1234 }
```
