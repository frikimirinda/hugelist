# HugeList - Documentacion de la clase

Clase JavaScript independiente para el renderizado de grandes listas tabulares (300.000+ filas) con scroll virtual, busqueda avanzada, ordenacion multi-columna, drag & drop de columnas y menu contextual de visibilidad.

**Dependencias:**
- jQuery 3.x+
- `gobpicjs.format()` (solo si se usan pictures de formato en los campos)
- Bootstrap Icons CSS (solo para los iconos de ordenacion en cabeceras)

**No depende** del framework `mifw`. Funciona de forma completamente autonoma.

---

## Indice

1. [Arquitectura general](#1-arquitectura-general)
2. [Propiedades](#2-propiedades)
3. [Metodos publicos](#3-metodos-publicos)
   - [post()](#postopt)
   - [requestServerData()](#requestserverdataopt)
   - [render()](#renderfrom-to)
   - [updateRender()](#updaterender)
   - [order()](#order)
   - [dataFind()](#datafindtexto-campos)
   - [dataFindReset()](#datafindreset)
   - [moveColumn()](#movecolumnfromidx-toidx)
4. [Eventos (callbacks)](#4-eventos-callbacks)
5. [Formato de datos del servidor (PHP)](#5-formato-de-datos-del-servidor-php)
6. [Busqueda avanzada](#6-busqueda-avanzada)
7. [Ordenacion](#7-ordenacion)
8. [Drag & Drop de columnas](#8-drag--drop-de-columnas)
9. [Menu contextual de visibilidad](#9-menu-contextual-de-visibilidad-de-columnas)
10. [Interaccion con teclado](#10-interaccion-con-teclado)
11. [Ejemplo completo](#11-ejemplo-completo-paso-a-paso)
12. [Referencia rapida de la estructura PHP](#12-referencia-rapida-de-la-estructura-php)

---

## 1. Arquitectura general

```
+-----------+       AJAX POST         +----------+
|           |  ------------------->   |          |
|  HugeList |    { cmd, data }        |   PHP    |
| (browser) |  <-------------------   | (server) |
|           |    JSON Response        |          |
+-----------+                         +----------+
      |
      v
  +-------+     Scroll virtual: solo renderiza
  | <table>|    las filas visibles en pantalla
  +-------+     (ej: 30 de 300.000)
```

**Flujo basico:**

1. Se crea una instancia de `HugeList`.
2. Se llama a `requestServerData(options)` indicando el `cmd` y el `ctlid` (id del div contenedor).
3. El servidor responde con un JSON que contiene los datos (`data`), los campos (`fld`), estilos y configuracion.
4. HugeList construye la tabla HTML, el CSS dinamico, la scrollbar y bindea todos los eventos.
5. Solo se renderizan las filas visibles en el viewport. Al hacer scroll (wheel, touch, teclado, scrollbar), se re-renderizan las filas correspondientes.

---

## 2. Propiedades

| Propiedad | Tipo | Descripcion |
|---|---|---|
| `data` | `Array` | Array de filas actualmente visibles (puede ser un subconjunto filtrado de `dataSrc`). Cada fila es un array de valores. |
| `dataSrc` | `Array` | Array original completo de filas (nunca se modifica por filtros, solo por reordenacion de columnas). |
| `dataNorm` | `Array` | Indice de busqueda pre-normalizado. Cada celda ya esta en minusculas, sin acentos y con fechas canonicas. Se construye de forma lazy. |
| `fld` | `Array` | Array de objetos campo. Cada campo tiene: `name`, `label`, `pic`, `align`, `css`. |
| `tableCSS` | `string` | Estilos CSS inline para la tabla (`style="..."`). |
| `tableClass` | `string` | Clases CSS para la tabla (ej: `"table-sm table-striped table-hover"`). |
| `orderBy` | `Array` | Indices de ordenacion (1-based). Positivo = ascendente, negativo = descendente. Ej: `[1, -3]` = ordenar por col 1 ASC, luego col 3 DESC. |
| `events` | `Array` | Eventos de fila del servidor (ej: `{'click': 'miFuncion', 'dblclick': 'otraFuncion'}`). |
| `fixedCols` | `number` | Numero de columnas fijas (sticky) a la izquierda. |
| `mainContainerId` | `string` | ID del contenedor principal de la pagina. |
| `ctlid` | `string` | ID del `<div>` que contiene la tabla. |
| `ctl` | `jQuery` | Referencia jQuery al contenedor `#ctlid`. |
| `options` | `Object` | Opciones pasadas a `requestServerData()`. |
| `renderFrom` | `number` | Indice de la primera fila renderizada actualmente. |
| `rowsToRender` | `number` | Cantidad de filas que se renderizan a la vez (calculado automaticamente segun el viewport). |
| `renderTo` | `number` | Indice de la ultima fila renderizada actualmente. |
| `curTR` | `jQuery` | Fila `<tr>` actualmente seleccionada. |
| `curTRIndex` | `number` | Indice de la fila seleccionada dentro del `<tbody>` visible. |
| `indexed` | `boolean` | `true` si el indice de busqueda (`dataNorm`) esta construido y actualizado. |
| `_colDragIdx` | `number` | Indice de la columna que se esta arrastrando (-1 si ninguna). Uso interno. |
| `_hiddenCols` | `Set` | Conjunto de indices de columnas ocultas. Uso interno. |
| `colWidths` | `Array` | Anchos maximos registrados por columna (para evitar saltos de layout). |
| `pages` | `number` | Numero total de paginas (calculado como `data.length / rowsToRender`). |

---

## 3. Metodos publicos

### `post(opt)`

Realiza una peticion POST AJAX de forma independiente.

**Parametros (`opt`):**

| Parametro | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `cmd` | `string` | Si | Nombre del comando que se envia al servidor (se mapea a `cmd_XXXX` en PHP). |
| `url` | `string` | No | URL destino. Por defecto usa la variable global `CONTEXT` o cadena vacia. |
| `data` | `Object` | No | Datos adicionales a enviar en el POST. |
| `dataType` | `string` | No | Tipo de respuesta (`'json'`, `'html'`...). Por defecto `'json'`. |
| `callBackDone` | `Function` | No | Funcion a ejecutar si la peticion es exitosa. Recibe la respuesta como argumento. |
| `callBackFail` | `Function` | No | Funcion a ejecutar si la peticion falla. Recibe el jqXHR como argumento. |

**Ejemplo:**

```javascript
const hl = new HugeList();

hl.post({
    cmd:  'getDatos',
    url:  '/api/clientes',
    data: { filtro: 'activos' },
    callBackDone: function(ret) {
        console.log('Recibidos:', ret);
    },
    callBackFail: function(xhr) {
        console.error('Error:', xhr.status);
    }
});
```

**Nota:** El POST envia automaticamente un `token` de `localStorage` para autenticacion:
```
POST data: { cmd: 'getDatos', data: { filtro: 'activos' }, token: '...' }
```

---

### `requestServerData(opt)`

Metodo principal para cargar datos. Combina la peticion AJAX con la inicializacion del control.

**Parametros (`opt`):**

| Parametro | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `cmd` | `string` | Si | Comando del servidor (ej: `'getDatos'`). |
| `ctlid` | `string` | Si | ID del `<div>` HTML que contendra la tabla. |
| `url` | `string` | No | URL destino. |
| `data` | `Object` | No | Datos adicionales a enviar. |
| `events` | `Object` | No | Callbacks del ciclo de vida (ver seccion [Eventos](#4-eventos-callbacks)). |

**Ejemplo:**

```javascript
const brw = new HugeList();

brw.requestServerData({
    cmd:   'getDatos',
    ctlid: 'miTabla',
    data:  { tipo: 'premium' },
    events: {
        beforeInit: function(ret) {
            console.log('Datos recibidos, a punto de inicializar');
        },
        afterInit: function(ret) {
            console.log('Tabla lista. Filas:', brw.data.length);
        },
        startIndexing: function() {
            console.time('Indexando');
        },
        endIndexing: function() {
            console.timeEnd('Indexando');
        },
        notOK: function(ret) {
            alert('Error: el servidor respondio ok=false');
        }
    }
});
```

**Respuesta esperada del servidor:**

```json
{
    "ok": true,
    "data": {
        "data": [ [1,"Juan","Garcia",...], [2,"Ana","Lopez",...], ... ],
        "fld": [
            {"name":"id",     "label":"ID",     "pic":"N04", "align":"R", "css":""},
            {"name":"nombre", "label":"Nombre", "pic":"",    "align":"L", "css":"color:green"},
            ...
        ],
        "tableCSS": "white-space:nowrap; cursor:default;",
        "tableClass": ["table-sm","table-striped","table-hover"],
        "orderBy": [1],
        "events": {"click":"miApp.clickRow", "dblclick":"miApp.dblclickRow"},
        "fixedCols": 1,
        "mainContainerId": "miApp"
    }
}
```

---

### `render(from, to)`

Renderiza un rango de filas en el `<tbody>`.

| Argumento | Descripcion |
|---|---|
| Sin argumentos | Avanza una pagina (siguiente bloque). |
| `render(-1)` | Retrocede una pagina (bloque anterior). |
| `render(0)` | Vuelve al inicio. |
| `render(from)` | Renderiza desde la fila `from`, `rowsToRender` filas. |
| `render(from, to)` | Renderiza el rango exacto `[from, to)`. |

**Ejemplo:**

```javascript
brw.render(0);          // Volver al principio
brw.render(-1);         // Pagina anterior
brw.render();           // Pagina siguiente
brw.render(500);        // Saltar a la fila 500
brw.render(100, 150);   // Mostrar filas 100 a 149
```

---

### `updateRender()`

Recalcula cuantas filas caben en el viewport y re-renderiza. Util despues de cambiar el tamanio de la ventana.

```javascript
$(window).on('resize', function() {
    brw.updateRender();
});
```

---

### `order()`

Ordena `this.data` segun el array `this.orderBy`. Se ejecuta automaticamente al hacer click en cabeceras y tras busquedas.

```javascript
// Ordenar por columna 2 descendente, luego columna 5 ascendente
brw.orderBy = [-2, 5];
brw.order();
brw.render(0);
```

---

### `dataFind(texto, campos)`

Busca en los datos y filtra los resultados. Devuelve el numero de coincidencias.

| Argumento | Tipo | Descripcion |
|---|---|---|
| `texto` | `string` | Termino de busqueda (ver seccion [Busqueda avanzada](#6-busqueda-avanzada)). |
| `campos` | `string` o `Array` | Nombre(s) de campo donde buscar. Si es cadena vacia o no coincide, busca en todos. |

**Retorno:** `number` - cantidad de registros encontrados (0 si no hay coincidencias).

**Ejemplo:**

```javascript
// Buscar "Juan" en todos los campos
const n = brw.dataFind('Juan', '');
console.log(n + ' registros encontrados');

// Buscar "Madrid" solo en el campo "ciudad"
brw.dataFind('Madrid', 'ciudad');

// Buscar "Madrid" en "ciudad" o "pais"
brw.dataFind('Madrid', ['ciudad', 'pais']);

// Buscar registros que contengan "Juan" Y "Madrid" (modo AND)
brw.dataFind('Juan+Madrid', '');

// Buscar "Juan" O "Pedro" (modo OR, espacios)
brw.dataFind('Juan Pedro', '');
```

---

### `dataFindReset()`

Restaura todos los datos originales (elimina el filtro). Devuelve el total de registros.

```javascript
const total = brw.dataFindReset();
console.log('Mostrando los ' + total + ' registros');
```

---

### `moveColumn(fromIdx, toIdx)`

Mueve una columna de una posicion a otra. Reordena campos, datos, indices de ordenacion y columnas ocultas.

| Argumento | Tipo | Descripcion |
|---|---|---|
| `fromIdx` | `number` | Indice 0-based de la columna origen. |
| `toIdx` | `number` | Indice 0-based de la posicion destino. |

```javascript
// Mover la columna 0 ("ID") a la posicion 3
brw.moveColumn(0, 3);
```

**Nota:** Este metodo se ejecuta automaticamente al arrastrar columnas con el raton. Tambien puede invocarse programaticamente.

---

## 4. Eventos (callbacks)

Los eventos se pasan dentro del objeto `options.events` al llamar a `requestServerData()`.

| Evento | Cuando se dispara | Argumento |
|---|---|---|
| `beforeInit` | Despues de recibir datos, antes de construir la tabla. | `ret` (respuesta del servidor) |
| `afterInit` | Despues de construir la tabla y bindear eventos. | `ret` (respuesta del servidor) |
| `startIndexing` | Justo antes de comenzar a construir el indice de busqueda (`dataNorm`). | Ninguno |
| `endIndexing` | Justo despues de terminar de construir el indice de busqueda. | Ninguno |
| `notOK` | Cuando el servidor responde con `ok: false`. | `ret` (respuesta del servidor) |

**Ejemplo completo de eventos:**

```javascript
brw.requestServerData({
    cmd:   'getDatos',
    ctlid: 'brw',
    events: {
        beforeInit: function(ret) {
            // Se puede modificar ret.data antes de inicializar
            console.log('Campos:', ret.data.fld.length);
        },
        afterInit: function(ret) {
            // La tabla ya esta construida
            // Buen momento para rellenar selectores, mostrar contadores, etc.
            $('#info').text(brw.data.length + ' registros');
        },
        startIndexing: function() {
            $('#status').text('Indexando datos...');
            console.time('Indexacion');
        },
        endIndexing: function() {
            $('#status').text('Listo');
            console.timeEnd('Indexacion');
        },
        notOK: function(ret) {
            alert('El servidor respondio con error');
            console.error(ret);
        }
    }
});
```

### Eventos de fila (click / dblclick)

Los eventos de fila se definen en el **servidor** (PHP) y se evaluan con `eval()`.

```php
$brw->events['click']    = 'miApp.clickRow';
$brw->events['dblclick'] = 'miApp.dblclickRow';
```

En el lado JavaScript, las funciones reciben el array de datos de la fila:

```javascript
window.miApp = {
    clickRow: function(rowData) {
        // rowData = [1, "Juan", "Garcia", "juan.garcia@...", ...]
        console.log('ID:', rowData[0], 'Nombre:', rowData[1]);
    },
    dblclickRow: function(rowData) {
        alert('Doble click en: ' + rowData[1] + ' ' + rowData[2]);
    }
};
```

---

## 5. Formato de datos del servidor (PHP)

### Clases necesarias en PHP

```php
class mibrowser {
    public array  $data = [];           // Array de filas (cada fila es un array de valores)
    public array  $fld = [];            // Array de mibrowser_fld
    public string $tableCSS = '';       // CSS inline para <table>
    public array  $tableClass = [];     // Clases CSS para <table>
    public array  $orderBy = [];        // Indices de ordenacion (1-based)
    public array  $events = [];         // Eventos de fila ('click' => 'funcion')
    public int    $fixedCols = 0;       // Columnas fijas (sticky)
    public string $mainContainerId = '';
}

class mibrowser_fld {
    public $name;    // Nombre interno del campo (ej: 'nombre')
    public $label;   // Etiqueta visible (ej: 'Nombre')
    public $pic;     // Picture de formato (ej: 'N04', 'D1', 'P###-###')
    public $align;   // Alineacion: 'L' (izquierda), 'R' (derecha), 'C' (centro)
    public $css;     // CSS adicional para la columna

    public function __construct($name, $label = '', $picture = '', $align = '', $css = '') {
        $this->name  = $name;
        $this->label = $label;
        $this->pic   = $picture;
        $this->align = $align;
        $this->css   = $css;
    }
}

class Response {
    public bool $ok   = true;
    public $html = '';
    public $css  = '';
    public $js   = '';
    public $data = '';

    public function __construct($op) {
        if (is_array($op)) {
            foreach ($op as $k => $v) {
                if (isset($this->$k))
                    $this->$k = $v;
            }
        }
    }

    public function send() {
        header('Content-Type: application/json');
        echo json_encode($this);
        exit;
    }
}
```

### Definicion de campos (fld)

Cada campo se define con `mibrowser_fld`:

```php
$brw = new mibrowser;

$brw->fld[] = new mibrowser_fld('id',       'ID',        'N04', 'R', '');
$brw->fld[] = new mibrowser_fld('nombre',   'Nombre',    '',    'L', 'color:green');
$brw->fld[] = new mibrowser_fld('email',    'Email',     '',    'L', '');
$brw->fld[] = new mibrowser_fld('telefono', 'Telefono',  'P###-###-###', 'L', '');
$brw->fld[] = new mibrowser_fld('saldo',    'Saldo',     'N.10', 'R', '');
$brw->fld[] = new mibrowser_fld('fecha',    'F. Alta',   'D1',   'R', '');
```

### Pictures de formato (`pic`)

Las pictures se procesan via `gobpicjs.format()` en el frontend:

| Picture | Descripcion | Entrada | Salida |
|---|---|---|---|
| `N04` | Numerico con relleno de ceros (4 digitos) | `7` | `0007` |
| `N.10` | Numerico con punto de miles (10 posiciones) | `1500` | `1.500` |
| `D1` | Fecha formato DD/MM/YYYY | `2024-03-15` | `15/03/2024` |
| `P###-###-###` | Pattern (cada `#` es un digito) | `612345678` | `612-345-678` |
| `P###~-~###~-~###` | Pattern con separador `~` (se elimina el `~`) | `612345678` | `612-345-678` |
| `false` o vacio | Sin formato, valor tal cual | `Juan` | `Juan` |

### Datos (data)

Los datos son un array de arrays. Cada fila es un array posicional que corresponde al orden de `fld`:

```php
$brw->data[] = [1, 'Juan',  'Garcia',  'juan.garcia@mail.com',  612345678, 'Madrid',   'Espana', 'Ingeniero', 35, 1500, '1989-05-23'];
$brw->data[] = [2, 'Maria', 'Lopez',   'maria.lopez@mail.com',  698765432, 'Barcelona','Espana', 'Medico',    42, 2300, '1982-11-07'];
```

### Envio de respuesta

```php
$response = new Response([
    'ok'   => true,
    'data' => $brw
]);
$response->send();
```

---

## 6. Busqueda avanzada

El metodo `dataFind(texto, campos)` soporta varios modos de busqueda:

### Normalizacion automatica

Antes de buscar, HugeList normaliza tanto los datos como los terminos de busqueda:
- Convierte a minusculas
- Elimina acentos (NFD + strip diacritics): `Garcia` = `garcia` = `García`
- Canoniza fechas: `15/03/2024` y `2024-03-15` se comparan como `20240315`

### Modos de busqueda

| Entrada | Modo | Descripcion |
|---|---|---|
| `Juan` | Normal | Busca "juan" en los campos indicados |
| `Juan Pedro` | OR | Registros que contengan "juan" **o** "pedro" |
| `Juan+Madrid` | AND (`+`) | Registros que contengan "juan" **y** "madrid" |
| `Juan+Madrid+Ingeniero` | AND multiple | Los tres terminos deben estar presentes |
| `&Juan Pedro` | AND (legacy `&`) | Ambos terminos deben estar en el **mismo campo** |

### Prioridad del `+`

Si la cadena contiene `+`, se usa el modo AND por `+` (separando por `+`). Si no contiene `+`, se usa el comportamiento clasico (espacios = OR, `&` al inicio = AND).

### Indice de busqueda lazy

El indice de busqueda (`dataNorm`) se construye de forma **lazy**: solo se genera la primera vez que se llama a `dataFind()`. Si se mueven columnas (`moveColumn()`), el indice se invalida y se reconstruye en la siguiente busqueda.

Los eventos `startIndexing` y `endIndexing` permiten monitorizar este proceso.

### Ejemplos practicos

```javascript
// Buscar clientes de Madrid
brw.dataFind('Madrid', 'ciudad');                // Solo en "ciudad"
brw.dataFind('Madrid', '');                      // En todos los campos

// Buscar "Juan" que viva en "Madrid"
brw.dataFind('Juan+Madrid', '');                 // AND: ambos deben existir en el registro

// Buscar "Juan" O "Pedro" O "Maria"
brw.dataFind('Juan Pedro Maria', '');            // OR: cualquiera vale

// Buscar por fecha (insensible al formato)
brw.dataFind('2024', 'fecha');                   // Todos los de 2024
brw.dataFind('15/03/2024', 'fecha');             // Fecha exacta (normaliza internamente)

// Buscar "ingeniero" en la profesion que viva en "Barcelona"
brw.dataFind('ingeniero+Barcelona', '');

// Restaurar todos los registros
brw.dataFindReset();
```

---

## 7. Ordenacion

### Click simple en cabecera

Un click en una cabecera ordena por esa columna:
- Primer click: ascendente
- Segundo click en la misma: descendente
- Click en otra columna: reemplaza la ordenacion anterior

### Click con Shift o Alt (multi-columna)

Manteniendo **Shift** o **Alt** al hacer click se agrega una columna de ordenacion secundaria:

```
Click en "Nombre"              --> orderBy = [2]       (col 2 ASC)
Shift+Click en "Ciudad"        --> orderBy = [2, 6]    (col 2 ASC, col 6 ASC)
Shift+Click en "Nombre" (otra vez) --> orderBy = [-2, 6]  (col 2 DESC, col 6 ASC)
```

### Iconos

- Flecha abajo: ascendente
- Flecha arriba: descendente

(Requiere Bootstrap Icons CSS)

### Ordenacion programatica

```javascript
// Ordenar por saldo descendente, luego por nombre ascendente
brw.orderBy = [-10, 2];
brw.order();
brw.render(0);
brw.setOrderIcons();  // Actualizar iconos en las cabeceras
```

---

## 8. Drag & Drop de columnas

Las columnas se pueden reorganizar arrastrando las cabeceras (`<th>`) con el raton.

**Comportamiento visual:**
- Al iniciar el arrastre, la cabecera origen se vuelve semitransparente.
- Al pasar sobre otra cabecera, aparece un borde azul en el lado izquierdo.
- Al soltar, la columna se mueve a la nueva posicion.

**Que se reordena:**
- Array de campos (`fld`)
- Array de anchos de columnas (`colWidths`)
- Indices de ordenacion (`orderBy`)
- **Todas las filas de datos** (in-place, tanto `data` como `dataSrc`)
- Indices de columnas ocultas (`_hiddenCols`)
- CSS de campos
- Cabeceras HTML

**El indice de busqueda se invalida** y se reconstruye de forma lazy en la siguiente busqueda.

```javascript
// Mover programaticamente la columna "email" (posicion 3) a la posicion 1
brw.moveColumn(3, 1);
```

---

## 9. Menu contextual de visibilidad de columnas

Al hacer **click derecho** sobre cualquier cabecera (`<th>`) de la tabla, aparece un menu contextual con un checkbox por cada campo.

**Comportamiento:**
- Por defecto, todas las columnas estan visibles (checkbox marcado).
- Desmarcar un checkbox oculta la columna (cabecera + celdas).
- **No se permite ocultar todas las columnas.** Si solo queda una visible, no se puede desmarcar.
- El menu se cierra al hacer click fuera o al pulsar **Escape**.
- Si se mueven columnas despues de ocultar, los indices se remapean correctamente.

**Implementacion tecnica:** La visibilidad se aplica mediante CSS dinamico (`display:none` en `th:nth-child(N)` y `td:nth-child(N)`), inyectado en un tag `<style>` con id `{ctlid}_colvis`.

---

## 10. Interaccion con teclado

Con el foco en la tabla:

| Tecla | Accion |
|---|---|
| Flecha Arriba | Selecciona la fila anterior |
| Flecha Abajo | Selecciona la fila siguiente |
| AvPag (Page Down) | Avanza una pagina |
| RePag (Page Up) | Retrocede una pagina |
| Inicio (Home) | Va a la primera fila |
| Fin (End) | Va a la ultima fila |

---

## 11. Ejemplo completo paso a paso

### Paso 1: HTML

```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mi listado</title>
    <!-- Bootstrap CSS (para estilos de tabla) -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- Bootstrap Icons (para flechas de ordenacion) -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
</head>
<body>

    <div class="container mt-3">
        <h4>Listado de clientes</h4>

        <!-- Buscador -->
        <div class="row mb-2">
            <div class="col-4">
                <input type="text" id="buscar" class="form-control form-control-sm" placeholder="Buscar...">
            </div>
            <div class="col-2">
                <select id="campo" class="form-control form-control-sm">
                    <option value="">Todos los campos</option>
                </select>
            </div>
            <div class="col-1">
                <button class="btn btn-primary btn-sm" onclick="miApp.buscar()">Buscar</button>
            </div>
            <div class="col-2">
                <span id="info" class="text-muted small"></span>
            </div>
        </div>

        <!-- Contenedor de la tabla (HugeList se renderiza aqui) -->
        <div id="brw" class="table-responsive" style="max-width:100%"></div>
    </div>

    <!-- jQuery (requerido por HugeList) -->
    <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
    <!-- Picture formatter (requerido si se usan pics) -->
    <script src="picture.kkcola.js"></script>
    <!-- HugeList -->
    <script src="hugelist.js"></script>
    <script>
        // ... ver Paso 2 ...
    </script>
</body>
</html>
```

### Paso 2: JavaScript del cliente

```javascript
window.miApp = {
    brw: null,

    init: function() {
        this.brw = new HugeList();
        this.cargarDatos();
    },

    cargarDatos: function() {
        this.brw.requestServerData({
            cmd:   'getDatos',
            ctlid: 'brw',                        // ID del <div> contenedor
            data:  { filtro: 'todos' },           // Datos extra para el servidor
            events: {
                afterInit: $.proxy(function() {
                    // Rellenar el select de campos para buscar
                    $('#campo').append('<option value="">Todos</option>');
                    for (const [k, fld] of this.brw.fld.entries()) {
                        $('#campo').append(
                            '<option value="' + fld.name + '">' + fld.label + '</option>'
                        );
                    }
                    // Mostrar contador
                    $('#info').text(this.brw.data.length + ' registros');
                }, this),

                startIndexing: function() {
                    console.time('Indexando');
                },
                endIndexing: function() {
                    console.timeEnd('Indexando');
                },
                notOK: function(ret) {
                    alert('Error al cargar datos');
                }
            }
        });
    },

    // Funcion referenciada desde PHP como evento 'click'
    clickRow: function(rowData) {
        console.log('Click en fila:', rowData);
    },

    // Funcion referenciada desde PHP como evento 'dblclick'
    dblclickRow: function(rowData) {
        console.log('Doble click en fila:', rowData);
    },

    buscar: function() {
        let texto = $('#buscar').val().trim();
        texto = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const campo = $('#campo').val();
        let n = 0;

        if (texto.length > 0) {
            n = this.brw.dataFind(texto, campo);
        } else {
            n = this.brw.dataFindReset();
        }

        $('#info').text((n || 0) + ' registros encontrados');
    }
};

$(function() {
    miApp.init();
});
```

### Paso 3: PHP del servidor

```php
<?php

function cmd_getDatos() {
    $brw = new mibrowser;

    // Definir campos
    $brw->fld[] = new mibrowser_fld('id',        'ID',        'N04',            'R', '');
    $brw->fld[] = new mibrowser_fld('nombre',    'Nombre',    '',               'L', 'color:green');
    $brw->fld[] = new mibrowser_fld('apellido',  'Apellido',  '',               'C', '');
    $brw->fld[] = new mibrowser_fld('email',     'Email',     '',               'L', '');
    $brw->fld[] = new mibrowser_fld('telefono',  'Telefono',  'P###~-~###~-~###','L','');
    $brw->fld[] = new mibrowser_fld('ciudad',    'Ciudad',    '',               'L', '');
    $brw->fld[] = new mibrowser_fld('pais',      'Pais',      '',               'L', '');
    $brw->fld[] = new mibrowser_fld('profesion', 'Profesion', '',               'L', '');
    $brw->fld[] = new mibrowser_fld('edad',      'Edad',      '',               'R', '');
    $brw->fld[] = new mibrowser_fld('saldo',     'Saldo',     'N.10',           'R', '');
    $brw->fld[] = new mibrowser_fld('fecha',     'Fecha',     'D1',             'R', '');

    // Generar datos (en produccion vendrian de una consulta)
    for ($id = 1; $id <= 100000; $id++) {
        $brw->data[] = [
            $id,
            'Nombre_' . $id,
            'Apellido_' . $id,
            'email' . $id . '@ejemplo.com',
            rand(600000000, 699999999),
            'Ciudad_' . rand(1, 50),
            'Pais_' . rand(1, 20),
            'Profesion_' . rand(1, 30),
            rand(18, 80),
            rand(1000, 50000),
            rand(1970, 2024) . '-' . str_pad(rand(1,12), 2, '0', STR_PAD_LEFT) . '-' . str_pad(rand(1,28), 2, '0', STR_PAD_LEFT)
        ];
    }

    // Configuracion
    $brw->orderBy[]    = 1;                           // Ordenar por ID ascendente
    $brw->tableClass[] = 'table-sm';
    $brw->tableClass[] = 'table-striped';
    $brw->tableClass[] = 'table-hover';
    $brw->tableCSS     = 'white-space:nowrap; cursor:default;';
    $brw->fixedCols    = 1;                           // Columna ID fija
    $brw->mainContainerId = 'miApp';

    // Eventos de fila
    $brw->events['click']    = 'miApp.clickRow';
    $brw->events['dblclick'] = 'miApp.dblclickRow';

    // Enviar respuesta
    $response = new Response(['ok' => true, 'data' => $brw]);
    $response->send();
}
```

---

## 12. Referencia rapida de la estructura PHP

### mibrowser_fld - Propiedades

| Propiedad | Tipo | Descripcion | Ejemplo |
|---|---|---|---|
| `name` | `string` | Nombre interno (para busquedas por campo) | `'nombre'` |
| `label` | `string` | Texto visible en la cabecera | `'Nombre'` |
| `pic` | `string` | Picture de formato (vacio = sin formato) | `'N04'`, `'D1'`, `'P###-###'` |
| `align` | `string` | Alineacion: `'L'`, `'R'`, `'C'` | `'R'` |
| `css` | `string` | CSS adicional para todas las celdas de esta columna | `'color:green; font-weight:bold'` |

### mibrowser - Propiedades

| Propiedad | Tipo | Descripcion | Ejemplo |
|---|---|---|---|
| `data` | `array` | Array de filas (cada fila es un array posicional) | `[[1,'Juan',...], [2,'Ana',...]]` |
| `fld` | `array` | Array de `mibrowser_fld` | |
| `tableCSS` | `string` | CSS inline del `<table>` | `'white-space:nowrap;'` |
| `tableClass` | `array` | Clases del `<table>` | `['table-sm','table-striped']` |
| `orderBy` | `array` | Indices 1-based de ordenacion | `[1, -3]` |
| `events` | `array` | Eventos de fila | `['click' => 'fn']` |
| `fixedCols` | `int` | Columnas sticky a la izquierda | `1` |
| `mainContainerId` | `string` | ID del contenedor principal | `'miApp'` |

### Response - Propiedades

| Propiedad | Tipo | Descripcion |
|---|---|---|
| `ok` | `bool` | `true` si la operacion fue correcta |
| `data` | `mixed` | Datos a devolver (normalmente un `mibrowser`) |
| `html` | `string` | HTML auxiliar (si se necesita) |
| `css` | `string` | CSS auxiliar |
| `js` | `string` | JavaScript auxiliar |

---

## Notas finales

- **Rendimiento:** HugeList esta optimizado para manejar cientos de miles de filas. Solo se renderizan las filas visibles en el viewport (scroll virtual). El indice de busqueda se construye una sola vez y se reutiliza.

- **CSS dinamico:** HugeList inyecta varios tags `<style>` en el `<head>`:
  - `#{ctlid}_css` — Estilos de layout (scrollbar, focus, etc.)
  - `#{ctlid}_fldcss` — Estilos de campos (alineacion, CSS custom por columna)
  - `#{ctlid}_colvis` — Visibilidad de columnas ocultas
  - CSS global con `.prevent-select` y `.hugelist-colmenu`

- **Sin framework:** No depende de `mifw`, `dvShow`, `CONTEXT` ni ningun otro componente del framework. Solo necesita jQuery y opcionalmente `gobpicjs` y Bootstrap Icons.
