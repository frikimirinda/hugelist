# HugeList

[![GitHub Repo](https://img.shields.io/badge/GitHub-gray?logo=github)](https://github.com/frikimirinda/hugelist)
[![GitHub Repo](https://img.shields.io/badge/npm-gray?logo=npm)](https://www.npmjs.com/package/hugelist)

**HugeList** is a standalone JavaScript class for rendering large tabular datasets (300,000+ rows) in the browser. It uses virtual scrolling so only the visible rows are ever rendered, making it fast even with massive datasets.

#### [You can try a live sample on here](https://frikimirinda.github.io/hugelist/test/test_hugelist_01.html)

## Overview

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

You can view all documentation on [hugelist.md](docs/HugeList.md)

### You can get more powerful toys on...

<p align="center">
  <a href="https://www.mirinda.es" title="go to mirinda.es"><img src="test/assets/mirinda_es.svg" width="227"></a>
</p>
