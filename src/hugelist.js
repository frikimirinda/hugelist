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
 */
class HugeList {

    data = {};
    dataSrc = {};
    dataNorm = [];  // Índice de búsqueda pre-calculado (normalizado)
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
    renderFrom = 0;
    rowsToRender = 20;
    renderTo = 0;

    curTR = null;
    curTRIndex = 0;
    indexed=false;
    _colDragIdx = -1;
    _hiddenCols = new Set();

    colWidths = [];

    pages = 0;


    // =====================================================================
    //  AJAX independiente
    // =====================================================================

    /**
     * Realiza una petición POST AJAX de forma independiente (sin mifw).
     *
     * @param {Object} options
     * @param {string} options.cmd          - Comando a enviar al servidor
     * @param {string} options.url          - URL destino (por defecto window.CONTEXT)
     * @param {Object} options.data         - Datos adicionales a enviar
     * @param {string} options.dataType     - Tipo de respuesta esperada ('json','html',...)
     * @param {Function} options.callBackDone - Callback en caso de éxito
     * @param {Function} options.callBackFail - Callback en caso de error
     */
    post(options) {
        const cmd       = options.cmd;
        const url       = options.url ?? (typeof CONTEXT !== 'undefined' ? CONTEXT : '');
        const data      = options.data ?? {};
        const dataType  = options.dataType ?? 'json';
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
    //  Petición de datos al servidor
    // =====================================================================

    requestServerData(options) {
        this.options = options;
        this.ctlid = options.ctlid;

        options.dataType = 'json';
        $('#'+this.ctlid).prepend('<div id="'+this.ctlid+'_loading" style="padding:20px;text-align:center;"> Cargando e indexando...</div>');

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
    //  Inicialización del control
    // =====================================================================

    initCtl() {

        this.ctl = $('#' + this.ctlid);
        const cssScript = '#' + this.ctlid + '_css';

        const svopac = this.ctl.css('opacity');
        this.ctl.css('opacity', 0);

        // Montar cabecera
        let fieldCss = '';
        let th = '';
        for (var x in this.fld) {
            x = x * 1;
            th += '<th draggable="true"><span>' + this.fld[x].label + '</span></th>';
            fieldCss += this.makeCssForField(x);
            this.colWidths[x] = 0;
        }
        th = "<thead class='prevent-select' id='" + this.ctlid + "_head'><tr>" + th + "</tr></thead><tbody id='" + this.ctlid + "_body'></tbody>";

        // Montar la tabla (outer)
        let ta = '<table tabindex="0" class="table ' + this.tableClass + '" style="' + this.tableCSS + '">' + th + '</table>';

        // Barra de scroll
        ta += `<div class='miscrollbar'><div class='miscrollbarptr'></div></div>`;
        ta += `<div class='mioverlayelement'></div>`;

        this.ctl.html(ta);

        $(cssScript).remove();
        $('#' + this.ctlid + '_fldcss').remove();

        let css = `
            #${this.ctlid} table:focus {
               outline: none;
            }
            #${this.ctlid} tr:focus {
               outline: 2px solid blue;
            }
            #${this.ctlid} th[draggable] {
               cursor: grab;
            }

            #${this.ctlid} .miscrollbar{
                position: absolute;
                top: 0;
                right: 0;
                width: 20px;
                height: 100%;
                background-color: rgba(255, 0, 0, 0.1);
                border-radius: 5px;
                opacity: 1;
            }

            #${this.ctlid} .miscrollbarptr{
                position: relative;
                width: 100%;
                height: 0px;
                background-color: rgba(0,255, 0, 0.7);
                min-height: 10px;
                user-select: none;
                display: flex;
            }

            #${this.ctlid} .mioverlayelement{
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 1000;
                display: none;
                background: transparent;
            }
        `;

        // CSS para celdas fijas
        if (this.fixedCols > 0) {
            css += `
                #${this.ctlid} table tr>th:nth-child(-n+${this.fixedCols}),tr>td:nth-child(-n+${this.fixedCols}) {
                    position: -webkit-sticky;
                    position: sticky;
                    left: 0;
                }
                #${this.ctlid} table tr th{
                    background: #FFF;
                }
                #${this.ctlid} table tr:nth-child(odd) td{
                    background: #FFF;
                }
                #${this.ctlid} table tr:nth-child(even) td {
                    background: #CCC;
                }
            `;
        }

        $('html > head').append($('<style id="' + cssScript + '" type="text/css">' + css + '</style>'));
        $('html > head').append($('<style id="' + this.ctlid + '_fldcss" type="text/css">' + fieldCss + '</style>'));

        this.setOrderIcons();

        // Ajustar líneas visibles
        this.render(0, 100);
        const fv = this.detectVisibleRows();
        if (fv.visibles >= 100)
            this.render(0, 200);

        this.rowsToRender = (fv.visibles <= 3) ? fv.visibles : fv.visibles - 3;
        this.render(this.renderFrom);
        this.ctl.css('opacity', svopac);

        // Ordenación
        this.ctl.find('th').on('click', $.proxy(this.clickHeader, this));

        // Arrastre de columnas
        this.ctl.find('th')
            .on('dragstart', $.proxy(this._colDragStart, this))
            .on('dragover',  $.proxy(this._colDragOver, this))
            .on('dragenter', $.proxy(this._colDragEnter, this))
            .on('dragleave', $.proxy(this._colDragLeave, this))
            .on('drop',      $.proxy(this._colDrop, this))
            .on('dragend',   $.proxy(this._colDragEnd, this));

        // Menú contextual columnas
        this.ctl.find('th').on('contextmenu', $.proxy(this._showColMenu, this));

        // Wheel
        this.ctl.on('wheel', $.proxy(this.wheelEvent, this));

        // Teclado
        this.ctl.find('.table').keydown($.proxy(this.tableKeyDown, this));

        // Click en la tabla
        this.resetTRClick();
        this.ctl.find('tbody tr').first().focus().trigger('click', 'silent');

        this.resetScrollbar();

        // Touch
        this.ctl.find('tbody').on('touchstart', $.proxy(this.touchstart, this));
        this.ctl.find('tbody').on('touchmove', $.proxy(this.touchmove, this));

        // Barra de scroll vertical
        this.ctl.find('.miscrollbarptr').on('mousedown', $.proxy(this.barMouseDown, this));
        this.ctl.find('.miscrollbarptr').on('touchstart', $.proxy(this.barTouchStart, this));
        this.ctl.find('.mioverlayelement').on('mouseup', $.proxy(this.barMouseUp, this));
        this.ctl.find('.miscrollbarptr').on('touchend', $.proxy(this.barTouchEnd, this));
        this.ctl.find('.mioverlayelement').on('mousemove', $.proxy(this.barMouseMove, this));
        this.ctl.find('.miscrollbarptr').on('touchmove', $.proxy(this.barTouchMove, this));

//        if (this.options.events && this.options.events.afterInit) {
//            this.options.events.afterInit();
//        }
    }


    // =====================================================================
    //  Eventos
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
            this.render();              // AvPag
        } else if (k == 33) {
            this.render(-1);            // RePag
        } else if (k == 36) {
            this.render(0);             // Inicio
        } else if (k == 35) {
            this.render(this.data.length - this.rowsToRender, this.data.length);  // Fin
        } else if (k == 38) {          // Arriba
            let tr = $(this.curTR).prev();
            if (tr.length == 0) {
                this.render(-1);
                tr = this.ctl.find('tbody tr').last();
            }
            this.curTR = tr;
            this.curTRIndex = this.curTR.index();
        } else if (k == 40) {          // Abajo
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
                        eval(this.events['click'])(this.data[this.curTR.attr('idx')]);
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

        const ascPos  = this.orderBy.indexOf(idx);
        const descPos = this.orderBy.indexOf(-idx);

        if (e.shiftKey || e.altKey) {
            // Multi-columna: añadir o invertir
            if (ascPos !== -1)
                this.orderBy[ascPos] = -idx;
            else if (descPos !== -1)
                this.orderBy[descPos] = idx;
            else
                this.orderBy.push(idx);
        } else {
            // Columna única: invertir si ya existe, o nueva ascendente
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
    //  Arrastre de columnas (drag & drop)
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

        // Construir permutación: perm[newPos] = oldPos
        const perm = [];
        for (let i = 0; i < len; i++) perm.push(i);
        const moved = perm.splice(fromIdx, 1)[0];
        perm.splice(toIdx, 0, moved);

        // Reordenar fld
        const oldFld = this.fld.slice();
        for (let i = 0; i < len; i++) this.fld[i] = oldFld[perm[i]];

        // Reordenar colWidths
        const oldCW = this.colWidths.slice();
        for (let i = 0; i < len; i++) this.colWidths[i] = oldCW[perm[i]] || 0;

        // Remapear orderBy (índices 1-based)
        const old2new = new Array(len);
        for (let i = 0; i < len; i++) old2new[perm[i]] = i;
        for (let i = 0; i < this.orderBy.length; i++) {
            const abs = Math.abs(this.orderBy[i]) - 1;
            const sign = this.orderBy[i] > 0 ? 1 : -1;
            this.orderBy[i] = sign * (old2new[abs] + 1);
        }

        // Reordenar datos in-place (dataSrc y data comparten las mismas filas)
        for (let i = 0; i < this.dataSrc.length; i++) {
            const row = this.dataSrc[i];
            const tmp = row.slice();
            for (let j = 0; j < len; j++) row[j] = tmp[perm[j]];
        }

        // Remapear columnas ocultas
        if (this._hiddenCols.size > 0) {
            const newHidden = new Set();
            this._hiddenCols.forEach(oldIdx => {
                newHidden.add(old2new[oldIdx]);
            });
            this._hiddenCols = newHidden;
        }

        // Invalidar índice de búsqueda
        this.indexed = false;

        // Reconstruir parte visual
        this._rebuildColumns();
    }

    _rebuildColumns() {
        // Regenerar cabecera
        let fieldCss = '';
        let th = '';
        for (let x = 0; x < this.fld.length; x++) {
            th += '<th draggable="true"><span>' + this.fld[x].label + '</span></th>';
            fieldCss += this.makeCssForField(x);
        }
        this.ctl.find('thead tr').html(th);

        // Reemplazar CSS de campos
        $('#' + this.ctlid + '_fldcss').remove();
        $('html > head').append($('<style id="' + this.ctlid + '_fldcss" type="text/css">' + fieldCss + '</style>'));

        // Re-render body
        this.render(this.renderFrom);

        // Re-enlazar eventos en th
        this.ctl.find('th').on('click', $.proxy(this.clickHeader, this));
        this.ctl.find('th')
            .on('dragstart', $.proxy(this._colDragStart, this))
            .on('dragover',  $.proxy(this._colDragOver, this))
            .on('dragenter', $.proxy(this._colDragEnter, this))
            .on('dragleave', $.proxy(this._colDragLeave, this))
            .on('drop',      $.proxy(this._colDrop, this))
            .on('dragend',   $.proxy(this._colDragEnd, this));

        // Menú contextual columnas
        this.ctl.find('th').on('contextmenu', $.proxy(this._showColMenu, this));

        this.setOrderIcons();
        this.resetTRClick();
        this._applyColVisibility();
    }


    // =====================================================================
    //  Menú contextual de visibilidad de columnas
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

        // Posicionar en el puntero del ratón, ajustando si se sale de la ventana
        let x = e.originalEvent.pageX;
        let y = e.originalEvent.pageY;
        const menuW = menu.outerWidth();
        const menuH = menu.outerHeight();
        if (x + menuW > $(window).width() + $(window).scrollLeft()) x -= menuW;
        if (y + menuH > $(window).height() + $(window).scrollTop()) y -= menuH;
        menu.css({ left: x, top: y });

        // Eventos de los checkboxes
        menu.find('input[type="checkbox"]').on('change', $.proxy(function (ev) {
            const idx = $(ev.target).data('colidx');
            this._toggleColVisibility(idx, ev.target.checked);
        }, this));

        // Cerrar al hacer clic fuera
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
            // No permitir ocultar todas las columnas
            if (this._hiddenCols.size >= this.fld.length - 1) {
                // Restaurar el checkbox
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
    //  Scrollbar personalizada
    // =====================================================================

    resetScrollbar() {
        const scrollBar = this.ctl.find('.miscrollbar');
        const scrollBarHeight = this.ctl.find('.table').height();
        const scrollBarTop = this.ctl.position().top;
        scrollBar.css({
            height: scrollBarHeight,
            top: scrollBarTop
        });
        const scrollBarPtr = this.ctl.find('.miscrollbarptr');
        this.pages = this.data.length / this.rowsToRender;
        const pageHeight = scrollBarHeight / this.pages;
        const prtY = (this.renderFrom / this.rowsToRender) * pageHeight;
        scrollBarPtr.css({
            height: pageHeight,
            top: prtY
        });
    }

    barMouseDown(e) {
        const draggable = this.ctl.find('.miscrollbarptr');
        draggable.attr('isDragging', 1);
        draggable.attr('offsetY', e.clientY - draggable[0].getBoundingClientRect().top);
        e.preventDefault();
        this.ctl.find('.mioverlayelement').show();
    }

    barTouchStart(e) {
        const draggable = this.ctl.find('.miscrollbarptr');
        draggable.attr('isDragging', 1);
        draggable.attr('offsetY', e.touches[0].clientY - draggable[0].getBoundingClientRect().top);
        e.preventDefault();
    }

    barMouseUp(e) {
        const draggable = this.ctl.find('.miscrollbarptr');
        if (draggable.attr('isDragging') == 1) {
            draggable.attr('isDragging', 0);
            this.ctl.find('.mioverlayelement').hide();
        }
    }

    barTouchEnd(e) {
        $(e.target).attr('isDragging', 0);
    }

    barMouseMove(e) {
        const draggable = this.ctl.find('.miscrollbarptr');
        if (draggable.attr('isDragging') != 1) return;
        const container = this.ctl.find('.miscrollbar');
        const containerRect = container[0].getBoundingClientRect();
        let y = e.clientY - containerRect.top - draggable.attr('offsetY') * 1;

        const containerHeight = container[0].clientHeight;
        const draggableHeight = draggable[0].clientHeight;

        if (y < 0) y = 0;
        if (y > containerHeight - draggableHeight) y = containerHeight - draggableHeight;

        draggable.css('top', y);

        const scrollBarHeight = this.ctl.find('tbody').height();
        this.pages = this.data.length / this.rowsToRender;
        const pageHeight = scrollBarHeight / this.pages;
        const from = Math.ceil((y / pageHeight) * this.rowsToRender);
        this.render(from);
    }

    barTouchMove(e) {
        const draggable = $(e.target);
        if (draggable.attr('isDragging') != 1) return;
        const container = this.ctl.find('.miscrollbar');
        const containerRect = container[0].getBoundingClientRect();
        let y = e.touches[0].clientY - containerRect.top - draggable.attr('offsetY') * 1;

        const containerHeight = container[0].clientHeight;
        const draggableHeight = e.target.clientHeight;

        if (y < 0) y = 0;
        if (y > containerHeight - draggableHeight) y = containerHeight - draggableHeight;

        draggable.css('top', y);

        const scrollBarHeight = this.ctl.find('tbody').height();
        this.pages = this.data.length / this.rowsToRender;
        const pageHeight = scrollBarHeight / this.pages;
        const from = Math.ceil((y / pageHeight) * this.rowsToRender);
        this.render(from);

        e.preventDefault();
    }


    // =====================================================================
    //  Touch (móvil/tablet)
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
    //  Renderizado
    // =====================================================================

    updateRender() {
        this.render(this.renderFrom, this.renderFrom + 100);
        const fv = this.detectVisibleRows();
        if (fv.visibles >= 100)
            this.render(0, 200);

        this.rowsToRender = (fv.visibles <= 3) ? fv.visibles : fv.visibles - 3;
        this.render(this.renderFrom);

        this.checkUnfavorableColWidths();
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
            for (var f in this.fld) {
                const v = (this.fld[f].pic != false && typeof Picture!='undefined') ? Picture.format(this.data[x][f], this.fld[f].pic) : this.data[x][f];
                //const v = (this.fld[f].pic == false) ? this.data[x][f] : Picture.format(this.data[x][f], this.fld[f].pic);
                tr += '<td>' + v + '</td>';
            }
            tr += '</tr>';
        }

        this.ctl.find('tbody').html(tr);

        this.checkUnfavorableColWidths();
        this.resetScrollbar();
    }


    // =====================================================================
    //  Ordenación
    // =====================================================================

    setOrderIcons() {
        this.ctl.find('th i').remove();
        for (let i = 0; i < this.orderBy.length; i++) {
            const col = this.orderBy[i];
            if (col >= 0) {
                this.ctl.find('th').eq(col - 1).append('<i class="bi bi-sort-down"></i>');
            } else {
                this.ctl.find('th').eq(Math.abs(col) - 1).append('<i class="bi bi-sort-up"></i>');
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
    //  Búsqueda / Filtro
    // =====================================================================

    // Normalizar texto para búsquedas (minúsculas, sin acentos, fechas canónicas)
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

    // Construir índice de búsqueda pre-normalizado (se llama una sola vez al cargar datos)
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

        if( !this.indexed )this._buildSearchIndex();

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
            // ---- Modo AND por + ----
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
                // ---- &AND con campos: cada campo seleccionado debe contener todos los términos ----
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
                // ---- &AND sin campos: al menos un campo debe contener todos los términos ----
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
                // ---- OR con campos: algún término en algún campo seleccionado ----
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
                // ---- OR sin campos: algún término en algún campo ----
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
    //  Utilidades
    // =====================================================================

    makeCssForField(idx) {
        let colcss = '';
        const align = (this.fld[idx].align == null) ? '' : this.fld[idx].align;
        switch (align.toUpperCase()) {
            case 'L': colcss += 'text-align:left;'; break;
            case 'R': colcss += 'text-align:right;'; break;
            case 'C': colcss += 'text-align:center;'; break;
            default:  colcss += 'text-align:left;';
        }
        colcss += this.fld[idx].css ?? '';
        return '#' + this.ctlid + ' td:nth-child(' + (idx * 1 + 1) + '){' + colcss + '}   ';
    }

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
}


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
