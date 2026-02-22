/**
 * HugeList - Clase independiente para renderizado de grandes listas tabulares
 * Refactorizada a partir de Mibrowser, con AJAX propio (sin dependencia de mifw).
 * Requiere jQuery para manipulación DOM.
 * 
 * 
 * Cómo funciona la búsqueda:
 * Juan — busca "Juan" (comportamiento normal)
 * Juan Pedro — busca registros que contengan "Juan" o "Pedro" (OR por espacios, como antes)
 * Juan+Madrid — busca registros que contengan "Juan" y "Madrid" (AND por +)
 * Juan+Madrid+Programador — los tres deben estar presentes en el registro
 * Cada parte separada por + se busca de forma independiente en los campos seleccionados (o en todos si no se selecciona ninguno).
 * El + tiene prioridad: si hay algún + en la búsqueda, se usa el modo AND entre grupos. Si no hay +, funciona como antes (espacios = OR, o & al inicio para AND).
 * 
 * 
 */
export class HugeList {
	static version = '1.0.0';

    data = {};
    dataSrc = {};
    dataNorm = [];  // Pre-calculated search index (normalized)
    fld = {};
    tableCSS = '';
    tableClass = '';
    orderBy = [];
    events = [];
    fixedCols = 0;
    mainContainerId = null;

    ctlid = null;
    ctl = null;
    options = {};
    showTotalRow = null;   // (option) Indicates if must paint a total row.
    renderFrom = 0;
    rowsToRender = 20;
    renderTo = 0;

    curTR = null;
    curTRIndex = 0;
    indexed = false;
    indexOnLoad = false;
    _colDragIdx = -1;
    _hiddenCols = new Set();

    _hasCallbacks = false;
    _hasCallbackFormatRow = false;
    _hasCallbackFormatTotals = false;

    colWidths = [];

    pages = 0;


    // =====================================================================
    //  Independent AJAX
    // =====================================================================

    /**
     * Perform a POST AJAX request independently (without mifw).
     *
     * @param {Object} options
     * @param {string} options.cmd          - Command to send to server
     * @param {string} options.url          - Destination URL (default window.CONTEXT)
     * @param {Object} options.data         - Additional data to send
     * @param {string} options.dataType     - Expected response type ('json','html',...)
     * @param {Function} options.callBackDone - Callback on success
     * @param {Function} options.callBackFail - Callback on error
     */
    post(options) {
        const cmd = options.cmd;
        const url = options.url ?? (typeof CONTEXT !== 'undefined' ? CONTEXT : '');
        const data = options.data ?? {};
        const dataType = options.dataType ?? 'json';
        const callBackDone = options.callBackDone;
        const callBackFail = options.callBackFail;
        $.ajax({
            url: url,
            cache: false,
            async: true,
            type: 'POST',
            data: { cmd: cmd, data: data, token: localStorage.getItem('token') },
            dataType: dataType
        })
            .done(function (ret) {
                if (callBackDone != null) {
                    callBackDone(ret);
                }
            })
            .fail(function (jqXHR, textStatus, errorThrown) {
                console.error('HugeList AJAX error:', textStatus, errorThrown);
                if (callBackFail != null) callBackFail(jqXHR);
            });
    }


    // =====================================================================
    //  Request Server Data
    // =====================================================================
    requestServerData(options) {
        this.options = options;
        this.ctlid = options.ctlid;
        this.showTotalRow = options.showTotalRow ?? null;

        options.dataType = 'json';
        $('#' + this.ctlid).prepend('<div id="' + this.ctlid + '_loading" style="padding:20px;text-align:center;"> Loading...</div>');

        options.callBackDone = $.proxy(function (ret) {
            if (ret.ok) {
                if (this.options.events && this.options.events.beforeInit) {
                    this.options.events.beforeInit(ret);
                }
                this.data = ret.data.data;
                this.dataSrc = [...this.data];
                this.fld = ret.data.fld;
                this.tableCSS = ret.data.tableCSS;
                this.tableClass = Array.isArray(ret.data.tableClass) ? ret.data.tableClass.join(' ') : ret.data.tableClass;
                this.orderBy = ret.data.orderBy ?? [];
                this.events = ret.data.events ?? [];
                this.fixedCols = ret.data.fixedCols ?? 0;
                this.mainContainerId = ret.data.mainContainerId;
                if (this.options.callbacks) {
                    this._hasCallbacks = true;
                    if (this.options.callbacks.formatRow) {
                        this._hasCallbackFormatRow = true;
                    }
                    if (this.options.callbacks.formatTotals) {
                        this._hasCallbackFormatTotals = true;
                    }
                }
                this.initCtl();
                if (this.options.events && this.options.events.afterInit) {
                    this.options.events.afterInit(ret);
                }
            } else {
                if (this.options.events && this.options.events.notOK) {
                    this.options.events.notOK(ret);
                }
            }
        }, this);

        options.callBackFail = $.proxy(function (ret) {
            console.error('HugeList requestServerData fail:', ret);
        }, this);

        this.post(options);
    }

    // =====================================================================
    //  Initialize Control
    // =====================================================================
    initCtl() {
        this.ctl = $('#' + this.ctlid);
        const cssScript = '#' + this.ctlid + '_css';

        const svopac = this.ctl.css('opacity');
        this.ctl.css('opacity', 0);

        // Compose Header
        let fieldCSS = '';
        let th = '';
        for (var x in this.fld) {
            //x = x * 1;
            th += '<th draggable="true"><span>' + this.fld[x].label + '</span></th>';
            fieldCSS += this.makeCssForField(x);
            this.colWidths[x] = 0;
        }
        th = "<thead class='prevent-select' id='" + this.ctlid + "_head'><tr>" + th + "</tr></thead><tbody id='" + this.ctlid + "_body'></tbody><tfoot></tfoot>";

        // Compose table (outer) + scrollbar in flex container
        let ta = `<div class='hugelist-scroll-wrapper table-responsive'>`;
        ta += '<table tabindex="0" class="table ' + this.tableClass + ' hugelist-table" style="' + this.tableCSS + '">' + th + '</table>';
        ta += `<div class='hugelist-scrollbar'><div class='hugelist-scrollbar-ptr'></div></div>`;
        ta += `</div>`;
        ta += `<div class='hugelist-overlay-element'></div>`;

        this.ctl.html(ta);

        let css = '';

        // CSS for fixed cells
        if (this.fixedCols > 0) {
            for (let i = 1; i <= this.fixedCols; i++) {
                css += `
                    #${this.ctlid} table tr > th:nth-child(${i}),
                    #${this.ctlid} table tr > td:nth-child(${i}) {
                        position: -webkit-sticky;
                        position: sticky;
                        left: 0;
                        z-index: 1;
                    }
                `;
            }
            css += `
                #${this.ctlid} table thead tr > th:nth-child(-n+${this.fixedCols}) {
                    z-index: 2;
                }
            `;
        }
        /*
        $('html > head').append($('<style id="' + cssScript + '" type="text/css">' + css + '</style>'));
        $('html > head').append($('<style id="' + this.ctlid + '_fldcss" type="text/css">' + fieldCSS + '</style>'));
        */
        $(cssScript).remove();
        $('html > head').append($('<style id="' + cssScript + '" type="text/css">' + css + fieldCSS + '</style>'));

        this.setOrderIcons();

        // Adjust visible rows
        this.render(0, 100);
        const fv = this.detectVisibleRows();
        if (fv.visibles >= 100)
            this.render(0, 200);

        this.rowsToRender = (fv.visibles <= 3) ? fv.visibles : fv.visibles - 3;
        this.render(this.renderFrom);
        this.ctl.css('opacity', svopac);

        // Sorting
        this.ctl.find('th').on('click', $.proxy(this.clickHeader, this));

        // Column drag
        this.ctl.find('th')
            .on('dragstart', $.proxy(this._colDragStart, this))
            .on('dragover', $.proxy(this._colDragOver, this))
            .on('dragenter', $.proxy(this._colDragEnter, this))
            .on('dragleave', $.proxy(this._colDragLeave, this))
            .on('drop', $.proxy(this._colDrop, this))
            .on('dragend', $.proxy(this._colDragEnd, this));

        // Column context menu
        this.ctl.find('th').on('contextmenu', $.proxy(this._showColMenu, this));

        // Wheel
        this.ctl.on('wheel', $.proxy(this.wheelEvent, this));

        // Keyboard
        this.ctl.find('.table').keydown($.proxy(this.tableKeyDown, this));

        // Click on table
        this.resetTRClick();
        this.ctl.find('tbody tr').first().focus().trigger('click', 'silent');

        this.resetScrollbar();

        // Touch
        this.ctl.find('tbody').on('touchstart', $.proxy(this.touchstart, this));
        this.ctl.find('tbody').on('touchmove', $.proxy(this.touchmove, this));

        // Vertical scrollbar
        this.ctl.find('.hugelist-scrollbar-ptr').on('mousedown', $.proxy(this.barMouseDown, this));
        this.ctl.find('.hugelist-scrollbar-ptr').on('touchstart', $.proxy(this.barTouchStart, this));
        this.ctl.find('.hugelist-overlay-element').on('mouseup', $.proxy(this.barMouseUp, this));
        this.ctl.find('.hugelist-scrollbar-ptr').on('touchend', $.proxy(this.barTouchEnd, this));
        this.ctl.find('.hugelist-overlay-element').on('mousemove', $.proxy(this.barMouseMove, this));
        this.ctl.find('.hugelist-scrollbar-ptr').on('touchmove', $.proxy(this.barTouchMove, this));

        //        if (this.options.events && this.options.events.afterInit) {
        //            this.options.events.afterInit();
        //        }

        if (this.indexOnLoad) this._buildSearchIndex();

        // Colsop
        if (this.showTotalRow !== false) {
            this.calculateTotalRow();
            this.renderFooter();
        }

    }



    // Adjust visible rows
    resize() {

        this.render(0, 100);
        const fv = this.detectVisibleRows();
        if (fv.visibles >= 100)
            this.render(0, 200);

        this.rowsToRender = (fv.visibles <= 3) ? fv.visibles : fv.visibles - 3;
        this.render(this.renderFrom);
        const svopac = this.ctl.css('opacity');
        this.ctl.css('opacity', svopac);
    }


    // =====================================================================
    //  Events
    // =====================================================================

    wheelEvent(e) {
        if (e.originalEvent.deltaY < 0) {
            this.render(-1);
        } else {
            this.render();
        }
        this.ctl.find('table').focus();
        this.resetTRClick();
        this.ctl.find('tbody tr').eq(this.curTRIndex).focus().trigger('click', 'silent');
    }


    tableKeyDown(e) {
        const k = e.keyCode;
        if (k == 34) {
            this.render();              // Page down - AvPag
        } else if (k == 33) {
            this.render(-1);            // Page up - RePag
        } else if (k == 36) {
            this.render(0);             // Home - Inicio
        } else if (k == 35) {
            this.render(this.data.length - this.rowsToRender, this.data.length);  // End - Fin
        } else if (k == 38) {          // Up - Arriba
            let tr = $(this.curTR).prev();
            if (tr.length == 0) {
                this.render(-1);
                tr = this.ctl.find('tbody tr').last();
            }
            this.curTR = tr;
            this.curTRIndex = this.curTR.index();
        } else if (k == 40) {          // Down - Abajo
            let tr = $(this.curTR).next();
            if (tr.length == 0) {
                this.render();
                tr = this.ctl.find('tbody tr').first();
            }
            this.curTR = tr;
            this.curTRIndex = this.curTR.index();
        }
        this.resetTRClick();
        this.ctl.find('tbody tr').eq(this.curTRIndex).focus().trigger('click', 'silent');
    }


    resetTRClick() {
        this.ctl.find('tbody tr').off().
            on('click', $.proxy(function (e, p) {
                this.curTR = $(e.currentTarget);
                this.curTRIndex = this.curTR.index();
                if (p == null && this.events['click'] != null) {
                    try {
                        eval(this.events['click'])(this.data[this.curTR.attr('idx')], this.curTR.attr('idx'));
                    } catch (e) { console.log('click error: ' + e); }
                }
            }, this)).
            on('dblclick', $.proxy(function (e, p) {
                this.curTR = $(e.currentTarget);
                this.curTRIndex = this.curTR.index();
                if (p == null && this.events['dblclick'] != null) {
                    try {
                        eval(this.events['dblclick'])(this.data[this.curTR.attr('idx')]);
                    } catch (e) { console.log('dblclick error: ' + e); }
                }
            }, this));
    }


    clickHeader(e) {
        let target = $(e.target).closest('th');
        if (target.length === 0) return;
        let idx = target.index() + 1;

        const ascPos = this.orderBy.indexOf(idx);
        const descPos = this.orderBy.indexOf(-idx);

        if (e.shiftKey || e.altKey) {
            // Multi-column: add or invert
            if (ascPos !== -1)
                this.orderBy[ascPos] = -idx;
            else if (descPos !== -1)
                this.orderBy[descPos] = idx;
            else
                this.orderBy.push(idx);
        } else {
            // Single column: invert if exists, or new ascending
            if (ascPos !== -1)
                this.orderBy = [-idx];
            else if (descPos !== -1)
                this.orderBy = [idx];
            else
                this.orderBy = [idx];
        }

        this.order();
        this.render(0);
        this.resetTRClick();
        this.setOrderIcons();
    }


    // =====================================================================
    //  Column drag & drop
    // =====================================================================

    _colDragStart(e) {
        const th = $(e.target).closest('th');
        if (th.length === 0) return;
        this._colDragIdx = th.index();
        e.originalEvent.dataTransfer.effectAllowed = 'move';
        e.originalEvent.dataTransfer.setData('text/plain', '');
        th.css('opacity', '0.4');
    }

    _colDragOver(e) {
        e.preventDefault();
        e.originalEvent.dataTransfer.dropEffect = 'move';
    }

    _colDragEnter(e) {
        const th = $(e.target).closest('th');
        if (th.length && th.index() !== this._colDragIdx) {
            th.css('border-left', '3px solid #0d6efd');
        }
    }

    _colDragLeave(e) {
        $(e.target).closest('th').css('border-left', '');
    }

    _colDrop(e) {
        e.preventDefault();
        const th = $(e.target).closest('th');
        if (th.length === 0) return;
        const toIdx = th.index();
        this.ctl.find('th').css({ 'border-left': '', 'opacity': '' });

        if (this._colDragIdx >= 0 && this._colDragIdx !== toIdx) {
            this.moveColumn(this._colDragIdx, toIdx);
        }
        this._colDragIdx = -1;
    }

    _colDragEnd(e) {
        this.ctl.find('th').css({ 'border-left': '', 'opacity': '' });
        this._colDragIdx = -1;
    }

    moveColumn(fromIdx, toIdx) {
        if (fromIdx === toIdx) return;
        const len = this.fld.length;

        // Build permutation: perm[newPos] = oldPos
        const perm = [];
        for (let i = 0; i < len; i++) perm.push(i);
        const moved = perm.splice(fromIdx, 1)[0];
        perm.splice(toIdx, 0, moved);

        // Reorder fld
        const oldFld = this.fld.slice();
        for (let i = 0; i < len; i++) this.fld[i] = oldFld[perm[i]];

        // Reorder colWidths
        const oldCW = this.colWidths.slice();
        for (let i = 0; i < len; i++) this.colWidths[i] = oldCW[perm[i]] || 0;

        // Remap orderBy (1-based indices)
        const old2new = new Array(len);
        for (let i = 0; i < len; i++) old2new[perm[i]] = i;
        for (let i = 0; i < this.orderBy.length; i++) {
            const abs = Math.abs(this.orderBy[i]) - 1;
            const sign = this.orderBy[i] > 0 ? 1 : -1;
            this.orderBy[i] = sign * (old2new[abs] + 1);
        }

        // Reorder data in-place (dataSrc and data share the same rows)
        for (let i = 0; i < this.dataSrc.length; i++) {
            const row = this.dataSrc[i];
            const tmp = row.slice();
            for (let j = 0; j < len; j++) row[j] = tmp[perm[j]];
        }

        // Remap hidden columns
        if (this._hiddenCols.size > 0) {
            const newHidden = new Set();
            this._hiddenCols.forEach(oldIdx => {
                newHidden.add(old2new[oldIdx]);
            });
            this._hiddenCols = newHidden;
        }

        // Invalidate search index
        this.indexed = false;

        // Rebuild visual part
        this._rebuildColumns();
    }

    _rebuildColumns() {
        // Regenerate header
        let fieldCss = '';
        let th = '';
        for (let x = 0; x < this.fld.length; x++) {
            th += '<th draggable="true"><span>' + this.fld[x].label + '</span></th>';
            fieldCss += this.makeCssForField(x);
        }
        this.ctl.find('thead tr').html(th);

        // Replace field CSS
        $('#' + this.ctlid + '_fldcss').remove();
        $('html > head').append($('<style id="' + this.ctlid + '_fldcss" type="text/css">' + fieldCss + '</style>'));

        // Re-render body
        this.render(this.renderFrom);

        // Re-link events on th
        this.ctl.find('th').on('click', $.proxy(this.clickHeader, this));
        this.ctl.find('th')
            .on('dragstart', $.proxy(this._colDragStart, this))
            .on('dragover', $.proxy(this._colDragOver, this))
            .on('dragenter', $.proxy(this._colDragEnter, this))
            .on('dragleave', $.proxy(this._colDragLeave, this))
            .on('drop', $.proxy(this._colDrop, this))
            .on('dragend', $.proxy(this._colDragEnd, this));

        // Column menu
        this.ctl.find('th').on('contextmenu', $.proxy(this._showColMenu, this));

        this.setOrderIcons();
        this.resetTRClick();
        this._applyColVisibility();
    }


    // =====================================================================
    //  Column visibility context menu
    // =====================================================================

    _showColMenu(e) {
        e.preventDefault();
        this._hideColMenu();

        const menu = $('<div class="hugelist-colmenu" id="' + this.ctlid + '_colmenu"></div>');

        for (let i = 0; i < this.fld.length; i++) {
            const checked = this._hiddenCols.has(i) ? '' : 'checked';
            const item = $('<label class="hugelist-colmenu-item">'
                + '<input type="checkbox" data-colidx="' + i + '" ' + checked + '> '
                + '<span>' + this.fld[i].label + '</span>'
                + '</label>');
            menu.append(item);
        }

        $('body').append(menu);

        // Position at mouse pointer, adjusting if it goes off-screen
        let x = e.originalEvent.pageX;
        let y = e.originalEvent.pageY;
        const menuW = menu.outerWidth();
        const menuH = menu.outerHeight();
        if (x + menuW > $(window).width() + $(window).scrollLeft()) x -= menuW;
        if (y + menuH > $(window).height() + $(window).scrollTop()) y -= menuH;
        menu.css({ left: x, top: y });

        // Checkbox events
        menu.find('input[type="checkbox"]').on('change', $.proxy(function (ev) {
            const idx = $(ev.target).data('colidx');
            this._toggleColVisibility(idx, ev.target.checked);
        }, this));

        // Close when clicking outside
        setTimeout($.proxy(function () {
            $(document).on('mousedown.hugelist_colmenu', $.proxy(function (ev) {
                if ($(ev.target).closest('.hugelist-colmenu').length === 0) {
                    this._hideColMenu();
                }
            }, this));
            $(document).on('keydown.hugelist_colmenu', $.proxy(function (ev) {
                if (ev.key === 'Escape') this._hideColMenu();
            }, this));
        }, this), 0);
    }

    _hideColMenu() {
        $('#' + this.ctlid + '_colmenu').remove();
        $(document).off('mousedown.hugelist_colmenu');
        $(document).off('keydown.hugelist_colmenu');
    }

    _toggleColVisibility(idx, visible) {
        if (visible) {
            this._hiddenCols.delete(idx);
        } else {
            // Don't allow hiding all columns
            if (this._hiddenCols.size >= this.fld.length - 1) {
                // Restore checkbox
                $('#' + this.ctlid + '_colmenu input[data-colidx="' + idx + '"]').prop('checked', true);
                return;
            }
            this._hiddenCols.add(idx);
        }
        this._applyColVisibility();
    }

    _applyColVisibility() {
        let css = '';
        this._hiddenCols.forEach(idx => {
            const nth = idx + 1;
            css += '#' + this.ctlid + ' th:nth-child(' + nth + '),';
            css += '#' + this.ctlid + ' td:nth-child(' + nth + '){display:none}';
        });
        $('#' + this.ctlid + '_colvis').remove();
        if (css) {
            $('html > head').append($('<style id="' + this.ctlid + '_colvis" type="text/css">' + css + '</style>'));
        }
    }


    // =====================================================================
    //  Custom scrollbar
    // =====================================================================

    resetScrollbar() {
        const scrollBar = this.ctl.find('.hugelist-scrollbar');
        const scrollBarHeight = scrollBar.height();
        const scrollBarPtr = this.ctl.find('.hugelist-scrollbar-ptr');
        this.pages = this.data.length / this.rowsToRender;
        const pageHeight = scrollBarHeight / this.pages;
        scrollBarPtr.css({ height: pageHeight });

        // Don't reposition if the user is dragging
        if (scrollBarPtr.attr('isDragging') == 1) return;

        const draggableHeight = scrollBarPtr[0].clientHeight;
        const maxY = scrollBarHeight - draggableHeight;
        const maxFrom = this.data.length - this.rowsToRender;
        const prtY = maxFrom > 0 ? (this.renderFrom / maxFrom) * maxY : 0;
        scrollBarPtr.css({ top: prtY });
    }

    barMouseDown(e) {
        const draggable = this.ctl.find('.hugelist-scrollbar-ptr');
        draggable.attr('isDragging', 1);
        draggable.attr('offsetY', e.clientY - draggable[0].getBoundingClientRect().top);
        e.preventDefault();
        this.ctl.find('.hugelist-overlay-element').show();
    }

    barTouchStart(e) {
        const draggable = this.ctl.find('.hugelist-scrollbar-ptr');
        draggable.attr('isDragging', 1);
        draggable.attr('offsetY', e.touches[0].clientY - draggable[0].getBoundingClientRect().top);
        e.preventDefault();
    }

    barMouseUp(e) {
        const draggable = this.ctl.find('.hugelist-scrollbar-ptr');
        if (draggable.attr('isDragging') == 1) {
            draggable.attr('isDragging', 0);
            this.ctl.find('.hugelist-overlay-element').hide();
        }
    }

    barTouchEnd(e) {
        $(e.target).attr('isDragging', 0);
    }

    barMouseMove(e) {
        const draggable = this.ctl.find('.hugelist-scrollbar-ptr');
        if (draggable.attr('isDragging') != 1) return;
        const container = this.ctl.find('.hugelist-scrollbar');
        const containerRect = container[0].getBoundingClientRect();
        let y = e.clientY - containerRect.top - draggable.attr('offsetY') * 1;

        const containerHeight = container[0].clientHeight;
        const draggableHeight = draggable[0].clientHeight;

        if (y < 0) y = 0;
        if (y > containerHeight - draggableHeight) y = containerHeight - draggableHeight;

        draggable.css('top', y);

        // Calculate data position proportional to useful travel
        const maxY = containerHeight - draggableHeight;
        const ratio = maxY > 0 ? y / maxY : 0;
        const maxFrom = this.data.length - this.rowsToRender;
        const from = Math.round(ratio * maxFrom);
        this.render(from);
    }

    barTouchMove(e) {
        const draggable = $(e.target);
        if (draggable.attr('isDragging') != 1) return;
        const container = this.ctl.find('.hugelist-scrollbar');
        const containerRect = container[0].getBoundingClientRect();
        let y = e.touches[0].clientY - containerRect.top - draggable.attr('offsetY') * 1;

        const containerHeight = container[0].clientHeight;
        const draggableHeight = e.target.clientHeight;

        if (y < 0) y = 0;
        if (y > containerHeight - draggableHeight) y = containerHeight - draggableHeight;

        draggable.css('top', y);

        // Calculate data position proportional to useful travel
        const maxY = containerHeight - draggableHeight;
        const ratio = maxY > 0 ? y / maxY : 0;
        const maxFrom = this.data.length - this.rowsToRender;
        const from = Math.round(ratio * maxFrom);
        this.render(from);

        e.preventDefault();
    }


    // =====================================================================
    //  Touch (mobile/tablet)
    // =====================================================================

    touchstart(e) {
        this.touchStartY = e.touches[0].clientY;
    }

    touchmove(e) {
        const y = e.touches[0].clientY;

        if (y > this.touchStartY + 50) {
            setTimeout($.proxy(function () { this.render(); }, this), 100);
            this.touchStartY = y;
        } else if (y < this.touchStartY - 50) {
            setTimeout($.proxy(function () { this.render(-1); }, this), 100);
            this.touchStartY = y;
        } else {
            return;
        }
        this.ctl.find('table').focus();
        this.resetTRClick();
        this.ctl.find('tbody tr').eq(this.curTRIndex).focus().trigger('click', 'silent');
    }


    // =====================================================================
    //  Render
    // =====================================================================

    updateRender() {
        this.render(this.renderFrom, this.renderFrom + 100);
        const fv = this.detectVisibleRows();
        if (fv.visibles >= 100)
            this.render(0, 200);

        this.rowsToRender = (fv.visibles <= 3) ? fv.visibles : fv.visibles - 3;
        this.render(this.renderFrom);

        this.checkUnfavorableColWidths();
        this._updateFixedColOffsets();
        this.resetScrollbar();
    }

    render(from, to) {
        if (from == -1) {
            to = this.renderFrom;
            from = this.renderFrom - this.rowsToRender;
        } else {
            from = (from == null) ? this.renderTo + 1 : from;
            to = (to == null) ? from + this.rowsToRender : to;
        }
        if (from < 0) { from = 0; to = this.rowsToRender; }
        if (to > this.data.length - 1) { to = this.data.length; from = to - this.rowsToRender; }

        this.renderFrom = (from < 0) ? 0 : from;
        this.renderTo = (to > this.data.length) ? this.data.length - 1 : to - 1;

        let tr = '';
        for (let x = this.renderFrom; x <= this.renderTo; x++) {
            tr += `<tr tabindex="0" idx="${x}">`;
            // Call callback formatRow if exists, pass a copy of data, so it can't modify the original data, but the user can if modify realdata param.
            if (this._hasCallbackFormatRow) {
                const p = structuredClone(this.data[x]);
                const trv = this.options.callbacks.formatRow({ idx: x, data: p, fld: this.fld, realdata: this.data[x] }) ?? this.data[x];
                for (var f in this.fld) {
                    tr += '<td>' + trv[f] + '</td>';
                }
            } else {
                // Else use default rendering (use Picture.format if pic is set, else raw value)
                for (var f in this.fld) {
                    const v = (this.fld[f].pic != false && typeof Picture != 'undefined') ? Picture.format(this.data[x][f], this.fld[f].pic) : this.data[x][f];
                    tr += '<td>' + v + '</td>';
                }
            }
            tr += '</tr>';
        }

        this.ctl.find('tbody').html(tr);

        this.checkUnfavorableColWidths();
        this._updateFixedColOffsets();
        this.resetScrollbar();
    }

    // =====================================================================
    //  Footer
    // =====================================================================

    renderFooter() {
        // If Picture.js class exists then format each column value with its picture
        for (var x in this.fld)
            this.totalrow[x] = (this.fld[x].pic != false && typeof Picture != 'undefined') ? Picture.format(this.totalrow[x], this.fld[x].pic) : this.totalrow[x];
        // Now you can format totals freely 
        if (this._hasCallbackFormatTotals)
            this.options.callbacks.formatTotals({ data: this.totalrow, fld: this.fld });
        // Now compose tfoot row
        let h = '';
        for (var x in this.totalrow)
            h += `<td>${this.totalrow[x]}</td>`;
        this.ctl.find('tfoot').html(`<tr>${h}</tr>`);
    }

    // Make calcs on each column indicated on the options.colops param
    // You can Count, Sum or Average a column
    calculateTotalRow() {
        const totalrows = this.data.length;
        this.totalrow = [];
        let total=0;
        for (var x in this.fld) {
            if (this.fld[x].colops != '') {
                switch (this.fld[x].colops.toLowerCase()) {
                    case 'c':   // count
                        this.totalrow.push(totalrows);
                        break;
                    case 's':   // sum column value
                        total = 0;
                        for (let row = 0; row < totalrows; row++) {
                            total += this.data[row][x];
                        }
                        this.totalrow.push(total);
                        break;
                    case 'a':   // average
                        total = 0;
                        for (let row = 0; row < totalrows; row++) {
                            total += this.data[row][x];
                        }
                        total=total/totalrows;
                        this.totalrow.push(total);
                        break;
                    default:
                        this.totalrow.push('');
                }
            } else {
                this.totalrow.push('');
            }
        }
        return this.totalrow;
    }

    showFooter(flg) {
        this.ctl.find('tfoot').toggle(flg);
    }



    // =====================================================================
    //  Sorting
    // =====================================================================

    setOrderIcons() {
        this.ctl.find('th i').remove();
        for (let i = 0; i < this.orderBy.length; i++) {
            const col = this.orderBy[i];
            if (col >= 0) {
                this.ctl.find('th').eq(col - 1).append('<i class="hugelist-sort hugelist-sort-down"></i>');
                //this.ctl.find('th').eq(col - 1).append('<i class="bi bi-sort-down"></i>');
            } else {
                this.ctl.find('th').eq(Math.abs(col) - 1).append('<i class="hugelist-sort hugelist-sort-up"></i>');
                //this.ctl.find('th').eq(Math.abs(col) - 1).append('<i class="bi bi-sort-up"></i>');
            }
        }
    }

    order() {
        this.data.sort((a, b) => {
            for (let x = 0; x < this.orderBy.length; x++) {
                const idx = Math.abs(this.orderBy[x]) - 1;
                if (this.orderBy[x] >= 0) {
                    if (a[idx] > b[idx]) return 1;
                    if (a[idx] < b[idx]) return -1;
                } else {
                    if (a[idx] > b[idx]) return -1;
                    if (a[idx] < b[idx]) return 1;
                }
            }
            return 0;
        });
    }


    // =====================================================================
    //  Search / Filter
    // =====================================================================

    getData(ix) {
        return this.data[ix];
    }

    // Normalize text for searches (lowercase, no accents, canonical dates)
    _norm(str) {
        let s = String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const parts = s.split(/[\/\-]/);
        if (parts.length === 3) {
            const a = parseInt(parts[0], 10);
            const b = parseInt(parts[1], 10);
            const c = parseInt(parts[2], 10);
            if (!isNaN(a) && !isNaN(b) && !isNaN(c)) {
                if (a > 31)
                    return String(a).padStart(4, '0') + String(b).padStart(2, '0') + String(c).padStart(2, '0');
                if (c > 31)
                    return String(c).padStart(4, '0') + String(b).padStart(2, '0') + String(a).padStart(2, '0');
            }
        }
        return s;
    }

    // Build pre-normalized search index (called once when loading data)
    _buildSearchIndex() {
        if (this.options.events && this.options.events.startIndexing) {
            this.options.events.startIndexing();
        }
        const src = this.dataSrc;
        const nrm = new Array(src.length);
        for (let i = 0; i < src.length; i++) {
            const row = src[i];
            const nr = new Array(row.length);
            for (let j = 0; j < row.length; j++) {
                nr[j] = this._norm(row[j]);
            }
            nrm[i] = nr;
        }
        this.dataNorm = nrm;
        this.indexed = true;
        if (this.options.events && this.options.events.endIndexing) {
            this.options.events.endIndexing();
        }
    }

    dataFind(find, flds) {

        if (!this.indexed) this._buildSearchIndex();

        if (!Array.isArray(flds))
            flds = ('' + flds).split(',');

        const fldsIdx = [];
        for (let x = 0; x < this.fld.length; x++) {
            if (flds.includes(this.fld[x].name))
                fldsIdx.push(x);
        }

        const src = this.dataSrc;
        const nrm = this.dataNorm;
        const useFlds = fldsIdx.length > 0;
        const result = [];

        if (find.indexOf('+') !== -1) {
            // ---- AND mode by + ----
            const grupos = find.split('+').map(g => this._norm(g.trim())).filter(g => g.length > 0);
            if (grupos.length === 0) return 0;

            for (let i = 0; i < src.length; i++) {
                const nr = nrm[i];
                let match = true;
                for (let g = 0; g < grupos.length; g++) {
                    let found = false;
                    if (useFlds) {
                        for (let f = 0; f < fldsIdx.length; f++) {
                            if (nr[fldsIdx[f]].includes(grupos[g])) { found = true; break; }
                        }
                    } else {
                        for (let f = 0; f < nr.length; f++) {
                            if (nr[f].includes(grupos[g])) { found = true; break; }
                        }
                    }
                    if (!found) { match = false; break; }
                }
                if (match) result.push(src[i]);
            }

        } else {
            const findAll = (find[0] === '&');
            if (findAll) find = find.substring(1);

            const terminos = this._norm(find).replace(/\s+/g, ' ').split(' ').filter(t => t.length > 0);
            if (terminos.length === 0) return 0;

            if (findAll && useFlds) {
                // ---- &AND with fields: each selected field must contain all terms ----
                for (let i = 0; i < src.length; i++) {
                    const nr = nrm[i];
                    let ok = true;
                    for (let f = 0; f < fldsIdx.length && ok; f++) {
                        const val = nr[fldsIdx[f]];
                        for (let t = 0; t < terminos.length; t++) {
                            if (!val.includes(terminos[t])) { ok = false; break; }
                        }
                    }
                    if (ok) result.push(src[i]);
                }

            } else if (findAll) {
                // ---- &AND without fields: at least one field must contain all terms ----
                for (let i = 0; i < src.length; i++) {
                    const nr = nrm[i];
                    let found = false;
                    for (let f = 0; f < nr.length; f++) {
                        let allMatch = true;
                        for (let t = 0; t < terminos.length; t++) {
                            if (!nr[f].includes(terminos[t])) { allMatch = false; break; }
                        }
                        if (allMatch) { found = true; break; }
                    }
                    if (found) result.push(src[i]);
                }

            } else if (useFlds) {
                // ---- OR with fields: some term in some selected field ----
                for (let i = 0; i < src.length; i++) {
                    const nr = nrm[i];
                    let found = false;
                    for (let t = 0; t < terminos.length && !found; t++) {
                        for (let f = 0; f < fldsIdx.length; f++) {
                            if (nr[fldsIdx[f]].includes(terminos[t])) { found = true; break; }
                        }
                    }
                    if (found) result.push(src[i]);
                }

            } else {
                // ---- OR without fields: some term in some field ----
                for (let i = 0; i < src.length; i++) {
                    const nr = nrm[i];
                    let found = false;
                    for (let t = 0; t < terminos.length && !found; t++) {
                        for (let f = 0; f < nr.length; f++) {
                            if (nr[f].includes(terminos[t])) { found = true; break; }
                        }
                    }
                    if (found) result.push(src[i]);
                }
            }
        }

        this.data = result;

        if (result.length === 0) {
            console.log('no hay coincidencias');
            return 0;
        }

        if (this.showTotalRow !== false) {
            this.calculateTotalRow();
            this.renderFooter();
        }

        this.order();
        this.render(0);
        return this.data.length;
    }

    dataFindReset() {
        this.data = [...this.dataSrc];
        this.order();
        this.render(0);
        return this.data.length;
    }


    // =====================================================================
    //  Utilities
    // =====================================================================
    showCol(idx, flg = true) {
        $('#' + this.ctlid).find('tr td:nth-child(' + (1 + idx * 1) + '), tr th:nth-child(' + (1 + idx * 1) + ')').css('display', flg ? 'table-cell' : 'none');
    }

    hideCol(idx) {
        this.showCol(idx, false);
    }

    showAllCols() {
        $('#' + this.ctlid).find('tr td, tr th').css('display', 'table-cell');
    }

    hideAllCols() {
        $('#' + this.ctlid).find('tr td, tr th').css('display', 'none');
    }

    showColByField(fld, flg = true) {
        debugger;
        const idx = this.fld.findIndex(x => x.fld == fld);
        if (idx != -1) this.showCol(idx, flg);
    }

    hideColByField(fld) {
        this.showColByField(fld, false);
    }

    showAllColsByField() {
        this.fld.forEach((f, idx) => this.showCol(idx, true));
    }

    hideAllColsByField() {
        this.fld.forEach((f, idx) => this.showCol(idx, false));
    }


    makeCssForField(idx) {
        let colcss = '', css1 = '';
        const align = (this.fld[idx].align == null) ? '' : this.fld[idx].align;
        switch (align.toUpperCase()) {
            case 'H': css1 = 'display:none;'; break;
            case 'L': css1 = 'text-align:left;'; break;
            case 'R': css1 = 'text-align:right;'; break;
            case 'C': css1 = 'text-align:center;'; break;
            default: css1 = 'text-align:left;';
        }
        colcss = css1 + (this.fld[idx].css ?? '');
        return `#${this.ctlid} td:nth-child( ${1 + idx * 1} ){ ${colcss} }   #${this.ctlid} th:nth-child( ${1 + idx * 1} ){ ${css1} } `;
    }
    /*
        makeCssForField(idx) {
            let colcss = '', ret = '';
            const align = (this.fld[idx].align == null) ? '' : this.fld[idx].align;
            switch (align.toUpperCase()) {
                case 'H':
                    ret = `#${this.ctlid} th:nth-child( ${1 + idx * 1} ){display:none} `;
                    colcss += 'display:none;';
                    break;
                case 'L': colcss += 'text-align:left;'; break;
                case 'R': colcss += 'text-align:right;'; break;
                case 'C': colcss += 'text-align:center;'; break;
                default: colcss += 'text-align:left;';
            }
            colcss += this.fld[idx].css ?? '';
            return `#${this.ctlid} td:nth-child( ${1 + idx * 1} ){ ${colcss} }   ${ret}`;
        }
    
    */
    detectVisibleRows() {
        const filas = this.ctl[0].querySelectorAll('tr');
        const viewportHeight = window.innerHeight;

        let filasVisibles = 0;
        let filasInvisibles = 0;
        const filasVisiblesArray = [];
        const filasInvisiblesArray = [];

        filas.forEach((fila, index) => {
            const rect = fila.getBoundingClientRect();
            const isVisible = !(rect.bottom < 0 || rect.top > viewportHeight);

            if (isVisible) {
                filasVisibles++;
                filasVisiblesArray.push(index);
            } else {
                filasInvisibles++;
                filasInvisiblesArray.push(index);
            }
        });

        return {
            total: filas.length,
            visibles: filasVisibles,
            invisibles: filasInvisibles,
            indicesVisibles: filasVisiblesArray,
            indicesInvisibles: filasInvisiblesArray
        };
    }

    checkUnfavorableColWidths() {
        this.ctl.find('tbody tr:first td').each((i, e) => {
            const w = $(e).width();
            if (this.colWidths[i] < w)
                this.colWidths[i] = w;
            $(e).css('width', this.colWidths[i]);
        });
    }

    _updateFixedColOffsets() {
        if (this.fixedCols <= 0) return;
        let offset = 0;
        for (let i = 1; i <= this.fixedCols; i++) {
            this.ctl.find(`table tr th:nth-child(${i}), table tr td:nth-child(${i})`).css('left', offset + 'px');
            const w = this.colWidths[i - 1] || this.ctl.find(`table thead th:nth-child(${i})`).outerWidth() || 0;
            offset += w;
        }
    }
}

/*
// CSS global prevent-select + context menu
(function () {
    const css = `
    .prevent-select {
        -webkit-user-select: none;
        -ms-user-select: none;
        user-select: none;
    }
    .hugelist-colmenu {
        position: absolute;
        z-index: 10000;
        background: #fff;
        border: 1px solid #ccc;
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0,0,0,.25);
        padding: 6px 0;
        min-width: 180px;
        max-height: 60vh;
        overflow-y: auto;
    }
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
    }`;
    $('html > head').append($('<style type="text/css">' + css + '</style>'));
})();
*/