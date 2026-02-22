# HugeList — Complete Documentation

**HugeList** is a standalone JavaScript class for rendering large tabular datasets (300,000+ rows) in the browser. It uses virtual scrolling so only the visible rows are ever rendered, making it fast even with massive datasets.

**Key features:**

- Virtual scroll — renders only the rows visible in the viewport
- Advanced search with OR, AND (`+`) and AND-prefix (`&`) modes
- Multi-column sorting (click headers, Shift/Alt for secondary columns)
- Column drag & drop reordering
- Column visibility context menu (right-click header)
- Custom vertical scrollbar with touch support
- Optional footer row with Count / Sum / Average per column
- `formatRow` and `formatTotals` callbacks for custom rendering
- Keyboard navigation (arrows, Page Up/Down, Home, End)
- Zero framework dependency — only requires jQuery

---

## Table of Contents

1. [Dependencies & Setup](#1-dependencies--setup)
2. [Architecture Overview](#2-architecture-overview)
3. [Public Properties](#3-public-properties)
4. [Public Methods](#4-public-methods)
   - [post()](#postopt)
   - [requestServerData()](#requestserverdataopt)
   - [resize()](#resize)
   - [render()](#renderfrom-to)
   - [updateRender()](#updaterender)
   - [order()](#order)
   - [setOrderIcons()](#setordericons)
   - [dataFind()](#datafindfind-flds)
   - [dataFindReset()](#datafindreset)
   - [getData()](#getdataidx)
   - [moveColumn()](#movecolumnfromidx-toidx)
   - [showCol() / hideCol()](#showcol--hidecol)
   - [showAllCols() / hideAllCols()](#showallcols--hideallcols)
   - [showColByField() / hideColByField()](#showcolbyfield--hidecolbyfield)
   - [showFooter()](#showfooterflg)
   - [calculateTotalRow()](#calculatetotalrow)
5. [Lifecycle Events](#5-lifecycle-events)
6. [Row Callbacks](#6-row-callbacks)
7. [Server Data Format (PHP)](#7-server-data-format-php)
8. [Advanced Search](#8-advanced-search)
9. [Sorting](#9-sorting)
10. [Column Drag & Drop](#10-column-drag--drop)
11. [Column Visibility Context Menu](#11-column-visibility-context-menu)
12. [Keyboard Navigation](#12-keyboard-navigation)
13. [Footer / Totals Row](#13-footer--totals-row)
14. [CSS Reference (hugelist.css)](#14-css-reference-hugelistcss)
15. [Complete Example (step by step)](#15-complete-example-step-by-step)
16. [Quick Reference — PHP structures](#16-quick-reference--php-structures)

---

## 1. Dependencies & Setup

### Required

| Dependency | Purpose | How to include |
|---|---|---|
| **jQuery 3.x +** | DOM manipulation, AJAX, event binding | `<script src="https://code.jquery.com/jquery-3.7.1.min.js">` |
| **hugelist.js** | The HugeList class itself | `<script src="hugelist.js">` |
| **hugelist.css** | Layout, scrollbar, sort icons, context menu | `<link rel="stylesheet" href="hugelist.css">` |

### Optional but recommended

| Dependency | Purpose | How to include |
|---|---|---|
| **Bootstrap 5 CSS** | Table styles (`table-striped`, `table-hover`, etc.) | CDN or local |
| **Bootstrap Icons CSS** | Sort arrow icons in column headers | `@import url("https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css")` |
| **Picture.js** | Numeric, date and pattern formatting via `pic` field | `import { Picture } from "..."` (see example) |

### Minimal HTML structure

```html
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="hugelist.css">
    <!-- Bootstrap CSS (optional, for table styles) -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- Bootstrap Icons (optional, for sort arrows) -->
    <style>
        @import url("https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css");
    </style>
</head>
<body>
    <!-- HugeList renders inside this div -->
    <div id="myList"></div>

    <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
    <script src="hugelist.js"></script>
    <script>
        const list = new HugeList();
        list.requestServerData({ cmd: 'getData', ctlid: 'myList' });
    </script>
</body>
</html>
```

---

## 2. Architecture Overview

```
+-----------+        AJAX POST          +----------+
|           |  ─────────────────────>   |          |
|  HugeList |   { cmd, data, token }    |  Server  |
| (browser) |  <─────────────────────   |  (PHP)   |
|           |      JSON Response        |          |
+-----------+                           +----------+
      │
      ▼
  Virtual scroll
  ┌─────────────┐   Only renders the rows that fit
  │   <table>   │   in the current viewport.
  │  (visible)  │   e.g. 25 rows out of 300,000.
  └─────────────┘   On scroll, rows are re-rendered.
```

**Basic flow:**

1. Create a `HugeList` instance.
2. Call `requestServerData(options)` specifying the server URL, command, and the `ctlid` (the `id` of the container `<div>`).
3. A loading indicator appears inside the container while the AJAX request is in flight.
4. The server returns a JSON response with: `data` (row arrays), `fld` (field definitions), table classes/CSS, sort order and row events.
5. `initCtl()` builds the `<table>` HTML, injects dynamic `<style>` tags, auto-detects how many rows fit in the viewport, binds all events and renders the first page.
6. From that point on, scrolling (wheel, touch, keyboard, scrollbar) calls `render()` to swap the visible rows without touching the DOM outside the `<tbody>`.

---

## 3. Public Properties

These properties are safe to read and, in some cases, set externally.

| Property | Type | Description |
|---|---|---|
| `data` | `Array` | The currently active dataset. When a filter is active this is a subset of `dataSrc`. Each element is an array of cell values (positional, matching the order of `fld`). |
| `dataSrc` | `Array` | The full original dataset as received from the server. Never modified by filters — only reordered in-place when columns are dragged. |
| `dataNorm` | `Array` | Pre-normalised search index (lowercase, no accents, canonical dates). Built lazily on the first `dataFind()` call and invalidated after `moveColumn()`. |
| `fld` | `Array` | Array of field-definition objects. Each has: `name`, `label`, `pic`, `align`, `css`, `colops`. |
| `tableCSS` | `string` | Inline CSS string applied to the `<table>` element. |
| `tableClass` | `string` | Space-separated CSS class string applied to `<table>` (e.g. `"table-sm table-striped table-hover"`). |
| `orderBy` | `Array` | 1-based column indices. Positive = ascending, negative = descending. Example: `[1, -3]` means sort col 1 ASC then col 3 DESC. |
| `events` | `Object` | Row event handlers sent from the server (e.g. `{ click: 'myApp.onClick', dblclick: 'myApp.onDblClick' }`). Evaluated with `eval()`. |
| `fixedCols` | `number` | Number of sticky columns frozen at the left edge. |
| `mainContainerId` | `string` | ID of the outermost application container (used by row event callbacks). |
| `ctlid` | `string` | ID of the `<div>` that hosts the table. |
| `ctl` | `jQuery` | jQuery reference to `#ctlid`. |
| `options` | `Object` | Options object passed to the last `requestServerData()` call. |
| `showTotalRow` | `boolean\|null` | Controls footer visibility. `null` = auto (render if colops present), `false` = never, `true` = always. |
| `renderFrom` | `number` | Index of the first currently rendered row. |
| `rowsToRender` | `number` | Number of rows rendered per page (auto-calculated from viewport height). |
| `renderTo` | `number` | Index of the last currently rendered row. |
| `curTR` | `jQuery` | The currently selected `<tr>`. |
| `curTRIndex` | `number` | Index of the selected row inside the visible `<tbody>`. |
| `indexed` | `boolean` | `true` when the search index (`dataNorm`) is built and valid. |
| `indexOnLoad` | `boolean` | Set to `true` to build the search index immediately after loading (instead of lazily on first search). |
| `colWidths` | `Array` | Maximum recorded width per column, used to prevent layout shifts when paging. |
| `pages` | `number` | Total number of virtual pages (`data.length / rowsToRender`). |

---

## 4. Public Methods

### `post(opt)`

Performs a standalone POST AJAX request (no framework required). Used internally by `requestServerData()` but can also be called directly.

**Parameters:**

| Key | Type | Required | Description |
|---|---|---|---|
| `cmd` | `string` | Yes | Command name sent to the server. |
| `url` | `string` | No | Target URL. Defaults to the global `CONTEXT` variable if defined, otherwise empty string. |
| `data` | `Object` | No | Extra data to include in the POST body. |
| `dataType` | `string` | No | Expected response type (`'json'`, `'html'`, …). Defaults to `'json'`. |
| `callBackDone` | `Function` | No | Called on success with the parsed response. |
| `callBackFail` | `Function` | No | Called on failure with the `jqXHR` object. |

The POST body always includes `{ cmd, data, token }` where `token` is read from `localStorage`.

**Example:**

```javascript
const hl = new HugeList();

hl.post({
    cmd: 'getReport',
    url: '/api/reports',
    data: { year: 2024 },
    callBackDone: function(ret) {
        console.log('Response:', ret);
    },
    callBackFail: function(xhr) {
        console.error('HTTP error:', xhr.status);
    }
});
```

---

### `requestServerData(opt)`

The main entry point. Sends the AJAX request, receives the server JSON, and initialises the table control.

**Parameters:**

| Key | Type | Required | Description |
|---|---|---|---|
| `cmd` | `string` | Yes | Server command (e.g. `'getData'`). |
| `ctlid` | `string` | Yes | `id` attribute of the container `<div>` where the table will be rendered. |
| `url` | `string` | No | Server URL. |
| `data` | `Object` | No | Additional POST data sent to the server. |
| `showTotalRow` | `boolean` | No | Override the footer behaviour: `false` disables it, `true` always shows it. |
| `events` | `Object` | No | Lifecycle event callbacks (see [Section 5](#5-lifecycle-events)). |
| `callbacks` | `Object` | No | Row-level rendering callbacks (see [Section 6](#6-row-callbacks)). |

**Expected server JSON structure:**

```json
{
    "ok": true,
    "data": {
        "data": [
            [1, "Alice", "Smith", "alice@example.com", 612345678, "London", "UK", 34, "Engineer", 4500, "1990-03-15"],
            [2, "Bob",   "Jones", "bob@example.com",   698765432, "Paris",  "FR", 28, "Designer", 3200, "1996-07-22"]
        ],
        "fld": [
            { "name": "id",         "label": "ID",         "pic": "N04",            "align": "R", "css": "",             "colops": "c" },
            { "name": "name",       "label": "Name",       "pic": "",               "align": "L", "css": "color:green",  "colops": "" },
            { "name": "surname",    "label": "Surname",    "pic": "",               "align": "L", "css": "",             "colops": "" },
            { "name": "email",      "label": "Email",      "pic": "",               "align": "L", "css": "",             "colops": "" },
            { "name": "phone",      "label": "Phone",      "pic": "P###~-~###~-~###","align": "L","css": "",             "colops": "" },
            { "name": "city",       "label": "City",       "pic": "",               "align": "L", "css": "",             "colops": "" },
            { "name": "country",    "label": "Country",    "pic": "",               "align": "L", "css": "",             "colops": "" },
            { "name": "age",        "label": "Age",        "pic": "",               "align": "R", "css": "",             "colops": "a" },
            { "name": "profession", "label": "Profession", "pic": "",               "align": "L", "css": "",             "colops": "" },
            { "name": "balance",    "label": "Balance",    "pic": "N.10",           "align": "R", "css": "",             "colops": "s" },
            { "name": "date",       "label": "Date",       "pic": "D1",             "align": "R", "css": "",             "colops": "" }
        ],
        "tableCSS": "white-space: nowrap; cursor: default;",
        "tableClass": ["table-sm", "table-striped", "table-hover"],
        "orderBy": [1],
        "events": {
            "click":    "myApp.clickRow",
            "dblclick": "myApp.dblClickRow"
        },
        "fixedCols": 1,
        "mainContainerId": "myApp"
    }
}
```

**Example:**

```javascript
const brw = new HugeList();

brw.requestServerData({
    cmd:   'getData',
    ctlid: 'myTable',
    url:   '/api/data',
    data:  { filter: 'active' },
    events: {
        beforeInit(ret) {
            // ret.data.data arrives as a JSON string when the payload is huge;
            // parse it here if needed.
            if (typeof ret.data.data === 'string') {
                ret.data.data = JSON.parse(ret.data.data);
            }
        },
        afterInit() {
            console.log('Table ready. Rows:', brw.data.length);
        },
        notOK(ret) {
            alert('Server returned ok=false');
        }
    }
});
```

> **Tip — large payloads:** When the dataset is very large (100,000+ rows), the server can send `data` as a raw JSON string. Parse it inside `beforeInit` to avoid double-serialisation overhead:
> ```javascript
> beforeInit(ret) {
>     ret.data.data = JSON.parse(ret.data.data);
> }
> ```

---

### `resize()`

Recalculates how many rows fit in the viewport and re-renders. Call this inside a `window.onresize` handler.

```javascript
window.onresize = function() {
    brw.resize();
};
```

---

### `render(from, to)`

Renders a range of rows into the `<tbody>`. All scroll, keyboard and touch interactions call this internally.

| Call | Behaviour |
|---|---|
| `render()` | Advance one page (next block of rows). |
| `render(-1)` | Go back one page (previous block). |
| `render(0)` | Jump to the first row. |
| `render(n)` | Jump to row `n` and render `rowsToRender` rows. |
| `render(from, to)` | Render the exact range `[from, to)`. |

```javascript
brw.render(0);        // Back to top
brw.render(-1);       // Previous page
brw.render();         // Next page
brw.render(500);      // Jump to row 500
brw.render(100, 150); // Rows 100–149
```

After rendering, `checkUnfavorableColWidths()` ensures columns do not shrink between pages, `_updateFixedColOffsets()` recalculates sticky column positions, and `resetScrollbar()` repositions the scrollbar thumb.

---

### `updateRender()`

Redetects how many rows fit in the viewport, then re-renders. Also rechecks column widths and fixed column offsets. Useful after DOM changes that alter the table's available height.

```javascript
$(window).on('resize', () => brw.updateRender());
```

---

### `order()`

Sorts `this.data` in-place according to `this.orderBy`. Called automatically when clicking headers. Can be called programmatically after changing `orderBy`.

```javascript
// Sort by column 2 descending, then column 5 ascending
brw.orderBy = [-2, 5];
brw.order();
brw.render(0);
brw.setOrderIcons(); // update the header arrows
```

---

### `setOrderIcons()`

Updates the sort-direction icons (▲ ▼) in the column headers to reflect the current `orderBy` state. Called automatically by `clickHeader()` and `order()`; call manually after programmatic sort changes.

---

### `dataFind(find, flds)`

Filters `this.data` to rows that match the search term, re-renders from row 0, and returns the match count. Does not modify `dataSrc`.

| Parameter | Type | Description |
|---|---|---|
| `find` | `string` | Search term. See [Section 8](#8-advanced-search) for syntax. |
| `flds` | `string` or `Array` | Field `name`(s) to search in. Empty string or non-matching names → search all fields. |

**Returns:** `number` — number of matching rows (0 if none found).

If the search index has not been built yet (`indexed === false`), it is built automatically before searching.

```javascript
// Search for "Alice" across all fields
let n = brw.dataFind('Alice', '');
console.log(n + ' records found');

// Search only in the "city" field
brw.dataFind('London', 'city');

// Search in multiple specific fields
brw.dataFind('London', ['city', 'country']);

// AND mode: rows containing "Alice" AND "London"
brw.dataFind('Alice+London', '');

// OR mode: rows containing "Alice" OR "Bob"
brw.dataFind('Alice Bob', '');

// Reset after search
brw.dataFindReset();
```

---

### `dataFindReset()`

Restores `this.data` to the full original dataset, applies the current sort, re-renders from row 0, and returns the total row count.

```javascript
const total = brw.dataFindReset();
console.log('Showing all', total, 'records');
```

---

### `getData(idx)`

Returns the data row at index `idx` in the currently active (possibly filtered) dataset.

```javascript
const row = brw.getData(0); // First visible row
console.log(row[1]); // Second cell value
```

---

### `moveColumn(fromIdx, toIdx)`

Moves a column from one position to another. Reorders:
- `fld` array
- `colWidths` array
- `orderBy` indices (remapped)
- All rows in `dataSrc` (and therefore `data`) in-place
- `_hiddenCols` set (indices remapped)

The search index is invalidated; it will be rebuilt lazily on the next search.

| Parameter | Type | Description |
|---|---|---|
| `fromIdx` | `number` | 0-based index of the source column. |
| `toIdx` | `number` | 0-based index of the destination position. |

```javascript
// Move the "ID" column (position 0) to position 3
brw.moveColumn(0, 3);
```

Called automatically by the drag & drop handlers; can also be called programmatically.

---

### `showCol` / `hideCol`

Show or hide a column by its 1-based index (as visible in the DOM, not the `fld` array).

```javascript
brw.showCol(2);     // Show column 2
brw.hideCol(2);     // Hide column 2
brw.showCol(2, false); // Also hides column 2
```

---

### `showAllCols` / `hideAllCols`

Show or hide every column at once.

```javascript
brw.hideAllCols();  // Hide everything
brw.showAllCols();  // Restore all
```

---

### `showColByField` / `hideColByField`

Show or hide a column by its field `name` (as defined in `fld`).

```javascript
brw.hideColByField('email');
brw.showColByField('email');
```

---

### `showFooter(flg)`

Toggle the `<tfoot>` visibility.

```javascript
brw.showFooter(true);  // Show footer
brw.showFooter(false); // Hide footer
```

---

### `calculateTotalRow()`

Recalculates the totals for each column based on `this.fld[x].colops` and the current `this.data`. Returns `this.totalrow`.

Operations (`colops` value):

| Value | Operation |
|---|---|
| `'c'` | Count — number of rows |
| `'s'` | Sum — sum of the column values |
| `'a'` | Average — arithmetic mean of the column values |
| `''` or anything else | Empty cell |

Called automatically after `dataFind()` and `dataFindReset()` when `showTotalRow !== false`.

---

## 5. Lifecycle Events

Events are passed in `options.events` to `requestServerData()`.

| Event | When it fires | Argument |
|---|---|---|
| `beforeInit(ret)` | After AJAX success, **before** the table DOM is built. You can mutate `ret.data` here (e.g. parse `data` from a JSON string). | Server response object |
| `afterInit(ret)` | After the table is fully built and all events are bound. Good place to populate search-field selectors or show row counts. | Server response object |
| `startIndexing()` | Just before the search index starts building. | — |
| `endIndexing()` | Just after the search index finishes building. | — |
| `notOK(ret)` | When the server responds with `ok: false`. | Server response object |

**Example:**

```javascript
brw.requestServerData({
    cmd:   'getData',
    ctlid: 'brw',
    events: {
        beforeInit(ret) {
            // Parse data if server sent it as a JSON string
            if (typeof ret.data.data === 'string') {
                ret.data.data = JSON.parse(ret.data.data);
            }
        },
        afterInit() {
            // Populate a field selector for the search bar
            const $sel = $('#fieldSelect');
            $sel.html('<option value="">All fields</option>');
            for (const [, fld] of brw.fld.entries()) {
                $sel.append(`<option value="${fld.name}">${fld.label}</option>`);
            }
            $('#rowCount').text(`${brw.data.length.toLocaleString()} records loaded`);
        },
        startIndexing() {
            console.time('Indexing');
        },
        endIndexing() {
            console.timeEnd('Indexing');
        },
        notOK(ret) {
            console.error('Server error:', ret);
            alert('Could not load data.');
        }
    }
});
```

---

## 6. Row Callbacks

Row callbacks are passed in `options.callbacks` to `requestServerData()`.

### `formatRow(params)`

Called for **every rendered row**, every time `render()` is called. Lets you transform cell values before they are written to the DOM.

| Property | Description |
|---|---|
| `params.idx` | Index of the row in the current `data` array. |
| `params.data` | A **deep clone** of the row array. Modify freely — it won't affect the original data. |
| `params.fld` | The `fld` array (field definitions). |
| `params.realdata` | Reference to the **original** row in `data`. Modify only if you intentionally want to mutate the source. |

Return the modified `params.data` (or `params.realdata`) array to use it for rendering.

```javascript
callbacks: {
    formatRow(params) {
        // Append a star to every name
        params.data[1] = params.data[1] + ' ★';
        // Mark negative balances in red
        if (params.data[9] < 0) {
            params.data[9] = '<span style="color:red">' + params.data[9] + '</span>';
        }
        return params.data;
    }
}
```

> **Performance note:** `formatRow` is called on every render pass. Keep it lightweight — avoid heavy DOM operations or synchronous network calls.

### `formatTotals(params)`

Called once after `calculateTotalRow()`, before the footer is rendered. Lets you post-process the totals array.

| Property | Description |
|---|---|
| `params.data` | The `totalrow` array (one entry per column). Modify in place. |
| `params.fld` | The `fld` array. |

```javascript
callbacks: {
    formatTotals(params) {
        // Replace the raw count with a label
        params.data[0] = params.data[0] + ' records';
        // Clear the average column (we don't want it displayed)
        params.data[7] = '';
    }
}
```

---

## 7. Server Data Format (PHP)

HugeList expects a JSON response with a specific structure. Below are the PHP helper classes used in `data_server.php` — you can adapt them to any server-side language.

### `mibrowser_fld` — Field definition

```php
class mibrowser_fld {
    public $name;    // Internal field name (used for field-scoped searches)
    public $label;   // Column header text
    public $pic;     // Format picture (empty = raw value)
    public $align;   // 'L' left | 'R' right | 'C' center | 'H' hidden
    public $css;     // Extra CSS applied to every <td> in this column
    public $colops;  // Footer operation: 'c' count | 's' sum | 'a' average | '' none

    public function __construct(
        $name, $label = '', $picture = '', $align = '', $css = '', $colops = ''
    ) {
        $this->name   = $name;
        $this->label  = $label;
        $this->pic    = $picture;
        $this->align  = $align;
        $this->css    = $css;
        $this->colops = $colops;
    }
}
```

### `mibrowser` — Table configuration

```php
class mibrowser {
    public $data          = [];   // Array of row-arrays (or a JSON string for large sets)
    public array $fld     = [];   // Array of mibrowser_fld
    public string $tableCSS   = '';   // Inline style for <table>
    public array $tableClass  = [];   // CSS classes for <table>
    public array $orderBy     = [];   // 1-based sort indices
    public array $events      = [];   // Row events: ['click' => 'fn', 'dblclick' => 'fn']
    public int $fixedCols     = 0;    // Number of left-sticky columns
    public string $mainContainerId = ''; // ID of the top-level app container
}
```

### `Response` — Response envelope

```php
class Response {
    public bool $ok   = true;
    public $data      = '';    // The mibrowser object (or anything else)
    public $html      = '';
    public $css       = '';
    public $js        = '';
    public $fld       = [];

    public function __construct($op) {
        if (is_array($op))
            foreach ($op as $k => $v)
                if (isset($this->$k)) $this->$k = $v;
    }

    public function send() {
        header('Content-Type: application/json');
        echo json_encode($this);
        exit;
    }
}
```

### Defining fields

```php
$brw = new mibrowser;

// mibrowser_fld($name, $label, $pic, $align, $css, $colops)
$brw->fld[] = new mibrowser_fld('id',        'ID',         'N04',             'R', '',             'c');
$brw->fld[] = new mibrowser_fld('name',      'Name',       '',                'L', 'color:green',  '');
$brw->fld[] = new mibrowser_fld('surname',   'Surname',    '',                'L', '',             '');
$brw->fld[] = new mibrowser_fld('email',     'Email',      '',                'L', '',             '');
$brw->fld[] = new mibrowser_fld('phone',     'Phone',      'P###~-~###~-~###','L', '',             '');
$brw->fld[] = new mibrowser_fld('city',      'City',       '',                'L', '',             '');
$brw->fld[] = new mibrowser_fld('country',   'Country',    '',                'L', '',             '');
$brw->fld[] = new mibrowser_fld('age',       'Age',        '',                'R', '',             'a');
$brw->fld[] = new mibrowser_fld('profession','Profession', '',                'L', '',             '');
$brw->fld[] = new mibrowser_fld('balance',   'Balance',    'N.10',            'R', '',             's');
$brw->fld[] = new mibrowser_fld('date',      'Date',       'D1',              'R', '',             '');
```

### Picture format codes (`pic`)

Picture codes are processed by **Picture.js** on the client. If Picture.js is not loaded, the raw value is used.

| Code | Description | Input | Output |
|---|---|---|---|
| `N04` | Numeric, zero-padded to 4 digits | `7` | `0007` |
| `N.10` | Numeric with thousands separator (`.`), 10 chars | `1500` | `1.500` |
| `D1` | Date formatted as `DD/MM/YYYY` | `2024-03-15` | `15/03/2024` |
| `P###-###-###` | Pattern — each `#` is one digit | `612345678` | `612-345-678` |
| `P###~-~###~-~###` | Pattern with `~` literal separator (tilde is stripped) | `612345678` | `612-345-678` |
| `''` or `false` | No formatting, raw value | `Alice` | `Alice` |

### Alignment codes (`align`)

| Code | Effect |
|---|---|
| `L` | `text-align: left` |
| `R` | `text-align: right` |
| `C` | `text-align: center` |
| `H` | `display: none` (column hidden by default) |
| (empty) | Defaults to `text-align: left` |

### Column operations (`colops`)

| Code | Footer value |
|---|---|
| `c` | Total row count |
| `s` | Sum of all values in this column |
| `a` | Arithmetic mean of all values in this column |
| `''` | Empty cell |

### Row data format

Data is an array of positional arrays. The order **must** match the order of `fld`.

```php
$brw->data[] = [1, 'Alice', 'Smith',  'alice@example.com',  612345678, 'London', 'UK', 34, 'Engineer', 4500.00, '1990-03-15'];
$brw->data[] = [2, 'Bob',   'Jones',  'bob@example.com',    698765432, 'Paris',  'FR', 28, 'Designer', 3200.00, '1996-07-22'];
```

### Row events

Defined in PHP, evaluated with `eval()` on the client:

```php
$brw->events['click']    = 'myApp.clickRow';
$brw->events['dblclick'] = 'myApp.dblClickRow';
```

The corresponding JavaScript functions receive the row data array and the row index:

```javascript
window.myApp = {
    clickRow(rowData, idx) {
        console.log('Clicked row', idx, '— ID:', rowData[0], 'Name:', rowData[1]);
    },
    dblClickRow(rowData, idx) {
        alert('Open detail for: ' + rowData[1] + ' ' + rowData[2]);
    }
};
```

### Sending the response

```php
$brw->orderBy[]       = 1;                            // Sort by col 1 ASC
$brw->tableClass[]    = 'table-sm';
$brw->tableClass[]    = 'table-striped';
$brw->tableClass[]    = 'table-hover';
$brw->tableCSS        = 'white-space: nowrap; cursor: default;';
$brw->fixedCols       = 1;
$brw->mainContainerId = 'myApp';

$response = new Response(['ok' => true, 'data' => $brw]);
$response->send();
```

---

## 8. Advanced Search

### Normalisation

Before any comparison, both the data and the search term are normalised by `_norm()`:

- Converted to lowercase
- Accents removed via NFD decomposition (`García` → `garcia`)
- Dates canonised: `15/03/2024` and `2024-03-15` both become `20240315`

This makes the search case-insensitive, accent-insensitive and date-format-agnostic.

### Search modes

| Input | Mode | Matches rows where… |
|---|---|---|
| `Alice` | Simple | Any field contains `"alice"` |
| `Alice Bob` | **OR** (space-separated) | Any field contains `"alice"` **or** `"bob"` |
| `Alice+London` | **AND** (`+`) | The record contains both `"alice"` and `"london"` (in any field) |
| `Alice+London+Engineer` | **AND** multiple | All three terms are present somewhere in the record |
| `&Alice Bob` | **AND** prefix (`&`) | One field contains both `"alice"` and `"bob"` at the same time |

**Priority rule:** If the search string contains `+`, AND-by-`+` mode is used exclusively (the `&` prefix is ignored). If there is no `+`, spaces produce OR and an optional leading `&` switches to AND.

### Field-scoped search

Pass a field `name` (or array of names) as the second argument to restrict where the search looks:

```javascript
brw.dataFind('London', 'city');              // Only in 'city'
brw.dataFind('London', ['city', 'country']); // In 'city' or 'country'
brw.dataFind('London', '');                  // All fields
```

### Lazy index

The search index (`dataNorm`) is built the first time `dataFind()` is called. Building it once for 100,000 rows typically takes a few hundred milliseconds. Subsequent searches on the same data are instant.

The index is invalidated (and rebuilt on the next search) when `moveColumn()` is called.

Use `indexOnLoad = true` to build it upfront:

```javascript
brw.indexOnLoad = true;
// Then call requestServerData…
// The index will be built right after initCtl() and fire startIndexing/endIndexing events
```

### Search examples

```javascript
// Find everyone named "Alice"
brw.dataFind('Alice', '');

// Find records from London
brw.dataFind('London', 'city');

// AND: Alice who lives in London
brw.dataFind('Alice+London', '');

// OR: Alice or Bob
brw.dataFind('Alice Bob', '');

// Date search (format-agnostic)
brw.dataFind('1990', 'date');           // Any date in 1990
brw.dataFind('15/03/1990', 'date');     // Specific date (normalised internally)

// AND: Engineer living in Paris
brw.dataFind('Engineer+Paris', '');

// Reset filter (show all rows again)
brw.dataFindReset();
```

---

## 9. Sorting

### Interactive (click headers)

- **Single click** on a header: sort by that column ascending.
- **Click again** on the same header: switch to descending.
- **Shift + click** or **Alt + click**: add the column as a secondary (then tertiary, …) sort key. Clicking again on an already-added column inverts its direction without removing others.

### Visual indicators

Sort direction is shown by small icons injected inside `<th>`:

- ▼ (`hugelist-sort-down`) — ascending
- ▲ (`hugelist-sort-up`) — descending

These icons use Bootstrap Icons glyphs via CSS `::before` pseudo-elements (see the CSS section).

### Programmatic sort

```javascript
// Sort by balance (col 10) descending, then by name (col 2) ascending
brw.orderBy = [-10, 2];
brw.order();
brw.render(0);
brw.setOrderIcons(); // Refresh header arrows
```

`orderBy` uses 1-based indices. Positive = ascending, negative = descending.

---

## 10. Column Drag & Drop

Column headers (`<th>`) are `draggable="true"`. Users can reorder columns by dragging a header horizontally over another.

**Visual feedback:**

- The dragged header fades to 40% opacity.
- The target header shows a blue left border while being hovered.
- On drop, columns swap and the table re-renders.

**What gets reordered:**

- `fld` array
- `colWidths` array
- `orderBy` indices (remapped automatically)
- All rows in `dataSrc`/`data` (in-place)
- `_hiddenCols` set (indices remapped)
- Column CSS and header HTML

**Programmatic reorder:**

```javascript
brw.moveColumn(0, 2); // Move column at index 0 to index 2
```

---

## 11. Column Visibility Context Menu

**Right-click** (or long-press on touch) on any column header opens a floating context menu listing all columns with checkboxes.

- **Checked** = column is visible.
- **Unchecked** = column is hidden (via `display:none` CSS injected into `<head>`).
- At least one column must remain visible — unchecking the last visible column is blocked.
- The menu closes when you click outside it or press **Escape**.

Hiding/showing columns via this menu updates the `_hiddenCols` set and injects/removes a `<style id="{ctlid}_colvis">` tag.

Programmatic column visibility is also available via [showCol / hideCol](#showcol--hidecol) and [showColByField / hideColByField](#showcolbyfield--hidecolbyfield).

---

## 12. Keyboard Navigation

The `<table>` element has `tabindex="0"` so it can receive focus. With focus on the table:

| Key | Action |
|---|---|
| **↑ Arrow Up** | Select the previous row. If at the top of the visible page, goes to the previous page and selects the last row. |
| **↓ Arrow Down** | Select the next row. If at the bottom of the visible page, goes to the next page and selects the first row. |
| **Page Down** | Go to the next page. |
| **Page Up** | Go to the previous page. |
| **Home** | Jump to the first row of the dataset. |
| **End** | Jump to the last row of the dataset. |

Row `click` events (from `events['click']`) are **not** fired on keyboard navigation — only on actual mouse/touch clicks.

---

## 13. Footer / Totals Row

When any field has a non-empty `colops`, HugeList renders a `<tfoot>` row below the table body showing aggregated values.

**Enable/disable:**

| `showTotalRow` value | Behaviour |
|---|---|
| `null` (default) | Footer rendered if any `colops` is set. |
| `true` | Footer always rendered. |
| `false` | Footer never rendered. |

Pass `showTotalRow` in the `requestServerData` options:

```javascript
brw.requestServerData({
    cmd:          'getData',
    ctlid:        'brw',
    showTotalRow: false  // Disable footer regardless of colops
});
```

**Footer styling** (from `hugelist.css`):

```css
.hugelist-table tfoot td {
    color: green;
    background-color: rgb(232, 250, 234);
}
```

**Post-process totals** with the `formatTotals` callback:

```javascript
callbacks: {
    formatTotals(params) {
        params.data[0] = params.data[0] + ' rows'; // Decorate count
        params.data[9] = '€ ' + params.data[9];    // Decorate sum
    }
}
```

---

## 14. CSS Reference (`hugelist.css`)

The `hugelist.css` file provides all the structural and visual styles required by HugeList. Below is a section-by-section explanation.

---

### Table base

```css
.hugelist-table {
    overflow-y: hidden;
    margin: 0px;
}
```

Prevents the native browser scrollbar from appearing on the table. Margin is zeroed so the table fills its wrapper without gaps.

```css
.hugelist-table:focus {
    outline: none;
}
```

Removes the default focus ring from the `<table>` (which has `tabindex="0"`). This keeps the UI clean; focus styling is applied on individual rows instead.

---

### Header — text selection & cursor

```css
.hugelist-table .prevent-select {
    -webkit-user-select: none;
    -ms-user-select: none;
    user-select: none;
}
```

Applied to `<thead>` via the class `prevent-select`. Prevents accidental text selection when clicking headers rapidly for sorting.

```css
.hugelist-table thead th {
    background-color: #93bdf9;
}

.hugelist-table thead th[draggable] {
    cursor: grab;
}
```

Headers have a light blue background. The `grab` cursor signals that columns are draggable.

---

### Row selection & focus

```css
.hugelist-table tbody tr:focus {
    border: 2px solid rgb(31, 110, 51) !important;
}

.hugelist-table tbody tr:nth-child(even):focus td,
.hugelist-table tbody tr:nth-child(odd):focus td {
    background-color: #55f3a9 !important;
}
```

The selected/focused row gets a green border and a bright green cell background, regardless of whether it is an even or odd row. The `!important` overrides Bootstrap's striped row colours.

---

### Striped rows

```css
.hugelist-table tbody tr:nth-child(even) td {
    background: #d1dcf0 !important;
}
.hugelist-table tbody tr:nth-child(odd) td {
    background: #EEE !important;
}
```

Alternating row colours (light blue-grey for even, light grey for odd). These defaults work with or without Bootstrap's `table-striped` class. Override in your own stylesheet as needed.

> **Note:** The first column has a special override in the example CSS for demo purposes:
> ```css
> .hugelist-table tbody td:nth-child(1) {
>     color: red;
>     text-align: right;
> }
> ```
> Remove or replace this rule in your own project.

---

### Footer

```css
.hugelist-table tfoot {
    display: table-footer-group;
}

.hugelist-table tfoot td {
    color: green;
    background-color: rgb(232, 250, 234);
}
```

Makes the `<tfoot>` behave as a normal footer group and gives it a light green background with green text to visually distinguish totals from data rows.

---

### Scroll wrapper

```css
.hugelist-scroll-wrapper {
    display: flex;
    align-items: stretch;
    margin-top: 10px;
}
```

The `<table>` and the custom scrollbar live side-by-side in a flex container. `align-items: stretch` makes the scrollbar track grow to the full height of the table.

---

### Custom scrollbar track

```css
.hugelist-scrollbar {
    position: relative;
    width: 20px;
    min-width: 20px;
    background-color: #dddddd8f;
    border-radius: 5px;
    opacity: 1;
}
```

A narrow, semi-transparent grey track sits to the right of the table. Fixed at 20 px wide.

---

### Custom scrollbar thumb (pointer)

```css
.hugelist-scrollbar .hugelist-scrollbar-ptr {
    position: relative;
    width: 100%;
    height: 0px;         /* Height is set dynamically via JS */
    background-color: rgba(139, 139, 139, 1);
    min-height: 10px;
    user-select: none;
    display: flex;
    border-radius: 20px;
}
```

The thumb height is calculated by JavaScript as a proportion of the total row count. `user-select: none` prevents text selection while dragging. The `min-height: 10px` ensures the thumb is always clickable even with very large datasets.

---

### Overlay element

```css
.hugelist-overlay-element {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1000;
    display: none;
    background: transparent;
}
```

A full-screen invisible overlay that is shown while the scrollbar thumb is being dragged. This captures `mousemove` events even when the cursor leaves the scrollbar area, preventing the drag from sticking or stopping unexpectedly.

---

### Sort icons

```css
.hugelist-sort::before,
[class*=" hugelist-sort-"]::before,
[class^=hugelist-sort-]::before {
    display: inline-block;
    font-family: bootstrap-icons !important;
    font-style: normal;
    font-weight: 400 !important;
    /* … standard Bootstrap Icons setup … */
}

.hugelist-sort-down::before {
    content: "\f575"; /* bi-sort-down ▼ */
}

/* Note: .hugelist-sort-sort-up is the class name in the source */
.hugelist-sort-sort-up::before {
    content: "\f57b"; /* bi-sort-up ▲ */
}
```

Sort icons are rendered using Bootstrap Icons' icon font. The `<i>` elements are injected into `<th>` by `setOrderIcons()`. If Bootstrap Icons is not loaded, no icon is displayed (the header is still clickable).

---

### Column visibility context menu

```css
.hugelist-colmenu {
    position: absolute;
    z-index: 10000;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, .25);
    padding: 6px 0;
    min-width: 180px;
    max-height: 60vh;
    overflow-y: auto;
}
```

The context menu is absolutely positioned at the mouse pointer coordinates (adjusted to stay inside the viewport). It can scroll if there are many columns.

```css
.hugelist-colmenu-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    cursor: pointer;
    white-space: nowrap;
    font-size: 13px;
}

.hugelist-colmenu-item:hover {
    background: #f0f0f0;
}

.hugelist-colmenu-item input[type="checkbox"] {
    margin: 0;
}
```

Each menu item is a `<label>` containing a checkbox and the column name. Hover highlight is a subtle grey. The menu is removed from the DOM when dismissed.

---

### Dynamic `<style>` tags injected by HugeList

In addition to `hugelist.css`, HugeList injects these `<style>` tags into `<head>` at runtime:

| Tag `id` | Content |
|---|---|
| `#{ctlid}_css` | Fixed-column (`sticky`) rules and field CSS (alignment, custom CSS per column). |
| `#{ctlid}_colvis` | `display:none` rules for hidden columns (managed by the context menu). |

These tags are replaced (not duplicated) on re-initialisation and after column moves.

---

### Customising the CSS

You can override any rule in your own stylesheet after `hugelist.css` is loaded. Common customisations:

```css
/* Change header background */
.hugelist-table thead th {
    background-color: #1e3a5f;
    color: #fff;
}

/* Change selected row colour */
.hugelist-table tbody tr:nth-child(even):focus td,
.hugelist-table tbody tr:nth-child(odd):focus td {
    background-color: #ffd966 !important;
}

/* Remove alternating row colours (use Bootstrap's table-striped instead) */
.hugelist-table tbody tr:nth-child(even) td,
.hugelist-table tbody tr:nth-child(odd) td {
    background: unset !important;
}

/* Wider scrollbar */
.hugelist-scrollbar {
    width: 12px;
    min-width: 12px;
}
```

---

## 15. Complete Example (step by step)

### Step 1 — HTML page

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HugeList Demo</title>

    <!-- Bootstrap CSS (optional) -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- Bootstrap Icons (for sort arrows) -->
    <style>
        @import url("https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css");
    </style>
    <!-- HugeList styles -->
    <link rel="stylesheet" href="hugelist.css">

    <style>
        body { padding: 20px; overflow-y: hidden; }
    </style>
</head>
<body>

<div class="container-fluid">
    <h4>Customer List</h4>

    <!-- Search bar -->
    <form onsubmit="myApp.search(); return false;" class="row g-2 mb-2">
        <div class="col-auto">
            <input type="text" id="searchInput" class="form-control form-control-sm" placeholder="Search…">
        </div>
        <div class="col-auto">
            <select id="fieldSelect" class="form-select form-select-sm">
                <option value="">All fields</option>
            </select>
        </div>
        <div class="col-auto">
            <button class="btn btn-primary btn-sm" type="submit">Search</button>
            <button class="btn btn-secondary btn-sm" type="button" onclick="myApp.resetSearch()">Reset</button>
        </div>
        <div class="col-auto">
            <span id="rowCount" class="text-muted small align-middle"></span>
        </div>
    </form>

    <!-- HugeList renders inside this div -->
    <div id="brw" style="max-width:100%;"></div>
</div>

<!-- jQuery (required) -->
<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>

<!-- Picture.js (optional, for pic formatting) -->
<script type="module">
    import { Picture } from "https://cdn.jsdelivr.net/gh/frikimirinda/picture@v.1.0.0/dist/picture.min.js";
    window.Picture = Picture;
</script>

<!-- HugeList -->
<script src="hugelist.js"></script>
<script src="app.js"></script>

</body>
</html>
```

### Step 2 — JavaScript (`app.js`)

```javascript
window.myApp = {
    brw: null,

    init() {
        this.brw = new HugeList();
        this.brw.indexOnLoad = false; // Build search index lazily (default)
        this.loadData();

        window.onresize = () => this.brw.resize();
    },

    loadData() {
        this.brw.requestServerData({
            cmd:   'getData',
            ctlid: 'brw',
            url:   '/api/data.php',
            data:  { limit: 50000 },

            events: {
                beforeInit(ret) {
                    // If server sends data as a JSON string, parse it here
                    if (typeof ret.data.data === 'string') {
                        ret.data.data = JSON.parse(ret.data.data);
                    }
                },

                afterInit: () => {
                    // Populate field selector
                    const $sel = $('#fieldSelect');
                    $sel.html('<option value="">All fields</option>');
                    for (const [, fld] of this.brw.fld.entries()) {
                        $sel.append(`<option value="${fld.name}">${fld.label}</option>`);
                    }
                    this.showCount(this.brw.data.length);
                },

                startIndexing: () => { $('#rowCount').text('Building search index…'); },
                endIndexing:   () => { this.showCount(this.brw.data.length); },

                notOK(ret) {
                    alert('Failed to load data. Check server logs.');
                    console.error(ret);
                }
            },

            callbacks: {
                formatRow(params) {
                    // Highlight negative balances in red
                    if (params.data[9] < 0) {
                        params.data[9] = `<span style="color:red">${params.data[9]}</span>`;
                    }
                    return params.data;
                },

                formatTotals(params) {
                    // Annotate the count cell
                    if (params.data[0]) params.data[0] += ' rows';
                    // Annotate the balance sum
                    if (params.data[9]) params.data[9] = '$ ' + params.data[9];
                }
            }
        });
    },

    // Called from PHP via events['click'] = 'myApp.clickRow'
    clickRow(rowData, idx) {
        console.log('Row clicked:', rowData);
    },

    // Called from PHP via events['dblclick'] = 'myApp.dblClickRow'
    dblClickRow(rowData, idx) {
        alert(`Open detail for ${rowData[1]} ${rowData[2]}`);
    },

    search() {
        let term = $('#searchInput').val().trim();
        // Normalise accents in the input before searching
        term = term.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const field = $('#fieldSelect').val();

        let n;
        if (term.length > 0) {
            n = this.brw.dataFind(term, field);
        } else {
            n = this.brw.dataFindReset();
        }
        this.showCount(n);
    },

    resetSearch() {
        $('#searchInput').val('');
        const n = this.brw.dataFindReset();
        this.showCount(n);
    },

    showCount(n) {
        $('#rowCount').text(n.toLocaleString() + ' records');
    }
};

$(function() {
    myApp.init();
});
```

### Step 3 — PHP server (`data.php`)

```php
<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// --- Helper classes (include from a shared file in production) ---

class mibrowser_fld {
    public $name, $label, $pic, $align, $css, $colops;
    public function __construct($n,$l='',$p='',$a='',$c='',$o=''){
        $this->name=$n; $this->label=$l; $this->pic=$p;
        $this->align=$a; $this->css=$c; $this->colops=$o;
    }
}

class mibrowser {
    public $data=[], $fld=[], $tableCSS='', $tableClass=[];
    public $orderBy=[], $events=[], $fixedCols=0, $mainContainerId='';
}

class Response {
    public $ok=true, $data='', $html='', $css='', $js='', $fld=[];
    public function __construct($op){ if(is_array($op)) foreach($op as $k=>$v) if(property_exists($this,$k)) $this->$k=$v; }
    public function send(){ echo json_encode($this); exit; }
}

// --- Data endpoint ---

function cmd_getData() {
    $brw = new mibrowser;

    $brw->fld[] = new mibrowser_fld('id',         'ID',         'N04',              'R', '',            'c');
    $brw->fld[] = new mibrowser_fld('name',        'Name',       '',                 'L', 'color:green', '');
    $brw->fld[] = new mibrowser_fld('surname',     'Surname',    '',                 'L', '',            '');
    $brw->fld[] = new mibrowser_fld('email',       'Email',      '',                 'L', '',            '');
    $brw->fld[] = new mibrowser_fld('phone',       'Phone',      'P###~-~###~-~###', 'L', '',            '');
    $brw->fld[] = new mibrowser_fld('city',        'City',       '',                 'L', '',            '');
    $brw->fld[] = new mibrowser_fld('country',     'Country',    '',                 'L', '',            '');
    $brw->fld[] = new mibrowser_fld('age',         'Age',        '',                 'R', '',            'a');
    $brw->fld[] = new mibrowser_fld('profession',  'Profession', '',                 'L', '',            '');
    $brw->fld[] = new mibrowser_fld('balance',     'Balance',    'N.10',             'R', '',            's');
    $brw->fld[] = new mibrowser_fld('date',        'Date',       'D1',               'R', '',            '');

    // Build data (replace with your DB query)
    $limit = min((int)($_POST['data']['limit'] ?? 1000), 1000000);
    $rows  = [];
    for ($i = 1; $i <= $limit; $i++) {
        $rows[] = [
            $i,
            'Name_'    . $i,
            'Surname_' . $i,
            'user'     . $i . '@example.com',
            rand(600000000, 699999999),
            'City_'    . rand(1, 50),
            'Country_' . rand(1, 20),
            rand(18, 80),
            'Profession_' . rand(1, 10),
            rand(1000, 50000),
            date('Y-m-d', mktime(0, 0, 0, rand(1,12), rand(1,28), rand(1970, 2024)))
        ];
    }

    // For large datasets send data as a JSON string to avoid PHP's memory limit
    // on json_encode of the full object. Parse it in beforeInit on the client.
    $brw->data        = json_encode($rows);

    $brw->orderBy[]   = 1;
    $brw->tableClass  = ['table-sm', 'table-striped', 'table-hover'];
    $brw->tableCSS    = 'white-space: nowrap; cursor: default;';
    $brw->fixedCols   = 1;
    $brw->mainContainerId = 'myApp';

    $brw->events['click']    = 'myApp.clickRow';
    $brw->events['dblclick'] = 'myApp.dblClickRow';

    (new Response(['ok' => true, 'data' => $brw]))->send();
}

// Dispatch
$cmd = $_POST['cmd'] ?? '';
if ($cmd === 'getData') cmd_getData();
else { echo json_encode(['ok'=>false,'msg'=>'Unknown command']); }
```

---

## 16. Quick Reference — PHP structures

### `mibrowser_fld` properties

| Property | Type | Description | Example |
|---|---|---|---|
| `name` | `string` | Internal field identifier (for field-scoped search) | `'balance'` |
| `label` | `string` | Column header text | `'Balance'` |
| `pic` | `string` | Format picture (see [Section 7](#picture-format-codes-pic)) | `'N.10'`, `'D1'`, `'P###-###'` |
| `align` | `string` | `'L'` left \| `'R'` right \| `'C'` center \| `'H'` hidden | `'R'` |
| `css` | `string` | Extra CSS applied to all `<td>` in this column | `'font-weight:bold; color:navy'` |
| `colops` | `string` | Footer aggregation: `'c'` count \| `'s'` sum \| `'a'` average \| `''` none | `'s'` |

### `mibrowser` properties

| Property | Type | Description | Example |
|---|---|---|---|
| `data` | `array\|string` | Row data (array of arrays, or a JSON-encoded string) | `[[1,'Alice',...], ...]` |
| `fld` | `array` | Array of `mibrowser_fld` | — |
| `tableCSS` | `string` | Inline style for `<table>` | `'white-space:nowrap;'` |
| `tableClass` | `array` | CSS classes for `<table>` | `['table-sm','table-striped']` |
| `orderBy` | `array` | 1-based sort indices (positive ASC, negative DESC) | `[1, -3]` |
| `events` | `array` | Row events | `['click' => 'myApp.fn']` |
| `fixedCols` | `int` | Number of left-sticky columns | `1` |
| `mainContainerId` | `string` | ID of the top-level app container | `'myApp'` |

### `Response` properties

| Property | Type | Description |
|---|---|---|
| `ok` | `bool` | `true` if the operation succeeded |
| `data` | `mixed` | The `mibrowser` object (serialised to JSON) |
| `html` | `string` | Optional auxiliary HTML |
| `css` | `string` | Optional auxiliary CSS |
| `js` | `string` | Optional auxiliary JavaScript |
| `fld` | `array` | Field definitions (also included inside `data`) |

---

## Notes & Tips

- **Memory:** With 300,000+ rows, the main memory consumer is `dataSrc` and `dataNorm`. Both are plain JS arrays. Modern browsers handle tens of millions of cell values without issue.
- **Performance:** Avoid heavy work inside `formatRow` — it is called every time a page of rows is rendered (on every scroll event).
- **Token auth:** `post()` automatically reads `localStorage.getItem('token')` and includes it in every POST. If your app does not use token auth, this is harmless.
- **No `mifw` dependency:** HugeList was refactored to be fully standalone. The global `CONTEXT` variable used as default URL is optional — you can always pass an explicit `url`.
- **Dynamic CSS injection:** HugeList injects `<style>` tags with predictable IDs (`#{ctlid}_css`, `#{ctlid}_colvis`). They are safely replaced (not duplicated) on every re-init or column operation.
