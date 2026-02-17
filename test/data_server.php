<?php
/**
 * Data sample sender for hugelist
 * 
 **/
//header("Access-Control-Allow-Origin: https://mirinda_local.es");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Credentials: true");


$records = (int)($_POST['data']['ramount'] ?? 1000);
$targetFile = dirname(__FILE__) . '/_tmp/' . $records . '.json';
if (file_exists($targetFile)) {
    readfile($targetFile);
    exit;
}
if ($records < 0 || $records > 1000000)
    $records = 1000;

global $targetFile, $firstTime;

//$targetFile = tempnam(dirname(__FILE__) . '/_tmp', 'data_server');

$targetFile2 = tempnam(dirname(__FILE__) . '/_tmp', 'data_server');


$mainContainer = 'listado1';

$brw = new mibrowser;

$a = explode(',', 'id,nombre,apellido,email,telefono,ciudad,pais,profesion,edad,saldo,fecha');
$pic = explode(',', 'N04,,,,P###~-~###~-~###,,,,,N.10,D1');
$ali = explode(',', ',R,C,,,,,,,R,R');
$css = explode(',', ',color:green');
foreach ($a as $k => $v) {
    $brw->fld[] = new mibrowser_fld(
        $v, // value
        ucfirst($v), // header
        $pic[$k] ?? '', // picture
        $ali[$k] ?? '', // align
        $css[$k] ?? '' // css
        );
}

$d = array();
$maxtosave = 50000;
$tr = 0;
$firstTime = true;



// Generate random data
for ($id = 1; $id <= $records; $id++) {
    //$brw->data[] = generarClienteAleatorio( $id );
    $d[] = generarClienteAleatorio($id);
    $tr += 1;
    if ($tr >= $maxtosave) {
        saveJSON(json_encode($d));
        $d = array();
        $tr = 0;
    }
}
if (count($d) > 0) {
    saveJSON(json_encode($d));
}

// Save json file
$input = fopen($targetFile, 'r');
$output = fopen($targetFile2, 'w');
// Escribir caracter al inicio
fwrite($output, '[');
// Copiar contenido en bloques
while (!feof($input)) {
    fwrite($output, fread($input, 8192));
}
// Escribir caracter al final
fwrite($output, ']');
fclose($input);
fclose($output);
// Reemplazar el original
rename($targetFile2, $targetFile);
chmod($targetFile, 0644);



$brw->orderBy[] = 1;
$brw->tableClass[] = 'table-sm';
$brw->tableClass[] = 'table-striped';
$brw->tableClass[] = 'table-hover';
$brw->tableCSS = 'white-space: nowrap; cursor:default; ';
$brw->events['click'] = "{$mainContainer}.clickRow";
$brw->events['dblclick'] = "{$mainContainer}.dblclickRow";
$brw->fixedCols = 1; // número de columnas fijas a la izquierda
$brw->mainContainerId = $mainContainer;
$brw->data = file_get_contents($targetFile);
//unlink($targetFile);

$response = new Response([
    'ok' => true,
    'data' => $brw,
]);


$response->toJSON($targetFile);

//$response->send();

readfile($targetFile);
exit;

// -----------------------------------------------------------

function saveJSON($j)
{
    global $targetFile, $firstTime;
    if ($firstTime) {
        $j = substr($j, 1, -1);
        $firstTime = false;
    }
    else {
        $j = ',' . substr($j, 1, -1);
    }

    $ret = file_put_contents($targetFile, $j, FILE_APPEND);
    if ($ret === false)
        die('Cant save data');
}


class mibrowser
{
    //public array $data=[];
    public string $data;
    public array $fld = [];
    public string $tableCSS = '';
    public array $tableClass = [];
    public array $orderBy = []; // lista de los ídices de los campos que van ordenados
    public array $events = [];
    public int $fixedCols = 0; // número de columnas fijas a la izquierda
    public string $mainContainerId;
}
class mibrowser_fld
{
    public $name;
    public $label;
    public $pic;
    public $align;
    public $css;
    public function __construct($name, $label = '', $picture = '', $align = '', $css = '')
    {
        $this->name = $name;
        $this->label = $label;
        $this->pic = $picture;
        $this->align = $align;
        $this->css = $css;
    }
}

class Response
{
    public bool $ok = true;
    public $html = '';
    public $css = '';
    public $js = '';
    public $data = '';
    public function __construct($op)
    {
        if (is_array($op)) {
            foreach ($op as $k => $v) {
                if (isset($this->$k))
                    $this->$k = $v;
            }
        }
    }
    public function send()
    {
        echo json_encode($this);
        exit;
    }
    public function toJSON($fname)
    {
        file_put_contents($fname, json_encode($this));
    }
}


// Función para generar datos aleatorios
function generarClienteAleatorio($id)
{
    $nombres = ['Juan', 'María', 'Pedro', 'Ana', 'Luis', 'Sofía', 'Carlos', 'Laura', 'Javier', 'Elena'];
    $apellidos = ['García', 'Rodríguez', 'Martínez', 'López', 'Pérez', 'González', 'Sánchez', 'Fernández', 'Ramírez', 'Torres'];
    $ciudades = ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Zaragoza', 'Málaga', 'Murcia', 'Bilbao', 'Alicante', 'Córdoba'];
    $paises = ['España', 'México', 'Argentina', 'Colombia', 'Chile', 'Perú', 'Ecuador', 'Venezuela', 'Uruguay', 'Bolivia'];
    $profesiones = ['Programador', 'Médico', 'Abogado', 'Profesor', 'Ingeniero', 'Arquitecto', 'Contador', 'Diseñador', 'Periodista', 'Enfermero'];

    $nombre = $nombres[rand(0, count($nombres) - 1)];
    $apellido = $apellidos[rand(0, count($apellidos) - 1)];
    $email = strtolower($nombre) . '.' . strtolower($apellido) . '@' . strtolower($profesiones[rand(0, count($profesiones) - 1)]);
    $telefono = rand(5, 6) . rand(10, 99) . rand(100000, 999999);
    $ciudad = $ciudades[rand(0, count($ciudades) - 1)];
    $pais = $paises[rand(0, count($paises) - 1)];
    $profesion = $profesiones[rand(0, count($profesiones) - 1)];
    $edad = rand(18, 80);
    $saldo = rand(1000, 15000);
    $fecha = rand(1940, 2024) . '-' . str_pad(rand(1, 12), 2, '0', STR_PAD_LEFT) . '-' . str_pad(rand(1, 30), 2, '0', STR_PAD_LEFT);

    return [
        $id,
        $nombre,
        $apellido,
        $email,
        $telefono,
        $ciudad,
        $pais,
        $profesion,
        $edad,
        $saldo,
        $fecha
    ];
}