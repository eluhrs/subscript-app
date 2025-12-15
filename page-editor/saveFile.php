<?php
/**
 * Saves Page XML files and if configured, requests the file to be commited to git.
 * Modified to auto-generate .txt file on save.
 *
 * @version $Version: 2020.10.28$
 * @author Mauricio Villegas <mauricio_ville@yahoo.com>
 * @copyright Copyright(c) 2017-present, Mauricio Villegas <mauricio_ville@yahoo.com>
 * @license MIT License
 */

require_once('common.inc.php');

$ddir = getcwd() . '/git-daemon';

/// Prepare response ///
$resp = (Object) null;
$resp->code = 200;

/// Accept any of GET, POST and command line ///
$json = json_decode(file_get_contents('php://input'), true);
$_GET = array_merge($_GET, $json);
$_GET = array_merge($_GET, $_POST);
if (!isset($_SERVER['HTTP_HOST']))
  for ($k = 1; $k < count($argv); $k++) {
    parse_str($argv[$k], $a);
    $_GET = array_merge($_GET, $a);
  }

/// Check expected parameters ///
$expected = array('fname', 'xml');
if (file_exists('/var/www/nw-page-editor/data/.git/config')) {
  $expected = array_merge($expected, array('uname', 'brhash', 'page_editor_version'));
}
foreach ($expected as $v) {
  if (empty($_GET[$v])) {
    $resp->code = 400;
    $resp->message = 'expected parameter not defined or empty: ' . $v;
    echo json_encode($resp) . "\n";
    exit($resp->code);
  }
}

/// Validate received filename ///
$fname = $_GET['fname'];

// 1. Must ensure simple characters allowed (now including @ and /)
//    But we must be careful with "/" to avoid traversal.
//    We explicitly allow ".." only at the beginning via strict prefix check.
if (strpos($fname, '../data/') !== 0) {
  $resp->code = 400;
  $resp->message = 'Invalid filename: Must start with ../data/';
  echo json_encode($resp) . "\n";
  exit($resp->code);
}

// 2. Traversal Check: Ensure no other ".." exists in the path
if (preg_match('/\.\.(?!\/data)/', $fname)) {
  // If ".." appears anywhere NOT followed by "/data" (i.e. the prefix we validated), reject.
  $resp->code = 400;
  $resp->message = 'Invalid filename: Path traversal detected.';
  echo json_encode($resp) . "\n";
  exit($resp->code);
}

// 3. Allow only safe characters (Alphanumeric, -, _, ., @, /)
//    Note: we already validated structure above, so this is just character set enforcement.
if (!preg_match('/^[a-zA-Z0-9_\-\.\@\/]+$/', $fname)) {
  $resp->code = 400;
  $resp->message = 'Invalid filename: Illegal characters.';
  echo json_encode($resp) . "\n";
  exit($resp->code);
}

// 4. Verify resolved path is actually inside the data directory
//    (realpath resolves symlinks and ..)
$baseDataDir = realpath(__DIR__ . '/../data'); // /var/www/nw-page-editor/data
$targetPath = realpath(dirname(__FILE__) . '/' . $fname);

// Note: realpath returns false if file doesn't exist. 
if ($targetPath) {
  if (strpos($targetPath, $baseDataDir) !== 0) {
    $resp->code = 400;
    $resp->message = 'Invalid path resolution (File outside data dir).';
    echo json_encode($resp) . "\n";
    exit($resp->code);
  }
} else {
  // If file doesn't exist, check parent dir
  $targetDir = realpath(dirname(dirname(__FILE__) . '/' . $fname));
  if (!$targetDir || strpos($targetDir, $baseDataDir) !== 0) {
    $resp->code = 400;
    $resp->message = 'Invalid path resolution (Dir outside data dir).';
    echo json_encode($resp) . "\n";
    exit($resp->code);
  }
}

/// Validate received XML ///
$tempFiles = glob($_GET['fname'] . '~*');
$numtemp = count($tempFiles);
$svg2page = new xsltProcessor();
$svg2page->importStyleSheet(DomDocument::load('../xslt/svg2page.xslt'));
$sortattr = new xsltProcessor();
$sortattr->importStyleSheet(DomDocument::load('../xslt/sortattr.xslt'));
$pagexml = $svg2page->transformToXML(DomDocument::loadXML($_GET['xml']));
$pagexml = $sortattr->transformToXML(DomDocument::loadXML($pagexml));
$bytes = file_put_contents($_GET['fname'] . '~' . $numtemp, $pagexml);
if (!$bytes) {
  $resp->code = 400;
  $resp->message = 'Problems writing to temporal file';
  echo json_encode($resp) . "\n";
  exit($resp->code);
}
exec("sed -n -r '/ xmlns=\"[^\"]+\"/{ s|.* xmlns=\"||; s|\".*||; p; }' ../xsd/pagecontent_omnius.xsd", $ns_schema, $rc1);
exec("sed -r '/ xmlns=\"[^\"]+\"/{ s| xmlns=\"[^\"]+\"| xmlns=\"" . $ns_schema[0] . "\"|; }' " . $_GET['fname'] . '~' . $numtemp, $output, $rc2);
if ($rc1 != 0 || $rc2 != 0) {
  file_put_contents($_GET['fname'] . '.svg~' . $numtemp, $_GET['xml']);
  $resp->code = 400;
  $resp->message = "Problems handling namespace of schema.";
  echo json_encode($resp) . "\n";
  exit($resp->code);
}
file_put_contents($_GET['fname'] . '~' . $numtemp . '-', implode("\n", $output));
$cmd = 'xmllint --noout --schema ../xsd/pagecontent_omnius.xsd ' . $_GET['fname'] . '~' . $numtemp . '- 2>&1';
unset($output);
exec($cmd, $output, $valid);
if ($valid != 0) {
  file_put_contents($_GET['fname'] . '.svg~' . $numtemp, $_GET['xml']);
  $resp->code = 400;
  $resp->message = "Page XML schema validation failed:\n" . implode("\n", $output);
  echo json_encode($resp) . "\n";
  exit($resp->code);
}
unlink($_GET['fname'] . '~' . $numtemp . '-');

/// Rename temporal XML ///
$bytes = rename($_GET['fname'] . '~' . $numtemp, $_GET['fname']);
if (!$bytes) {
  $resp->code = 400;
  $resp->message = 'Problems replacing file ' . $_GET['fname'];
  echo json_encode($resp) . "\n";
  exit($resp->code);
}

/// SYNC TXT FILE START (Added by Subscript-App) ///
try {
  $dom = new DOMDocument;
  $dom->load($_GET['fname']);
  $xpath = new DOMXPath($dom);

  // Auto-detect root namespace
  $rootNamespace = $dom->documentElement->lookupNamespaceUri(NULL);
  if ($rootNamespace) {
    $xpath->registerNamespace('p', $rootNamespace);
    $query = '//p:TextLine/p:TextEquiv/p:Unicode';
  } else {
    $query = '//TextLine/TextEquiv/Unicode';
  }

  $nodeList = $xpath->query($query);
  $textParts = [];
  foreach ($nodeList as $node) {
    // Only add plain text, skip structure. Join with \n
    $textParts[] = $node->nodeValue;
  }

  // Only write if we found something? Or overwrite with empty if e.g. all deleted?
  // We should overwrite to reflect current state.
  $txtContent = implode("\n", $textParts);
  // Explicitly ensure newline at end? User CLI had 24 lines.
  // If we just join by \n, we get simple lines. 
  // Add trailing newline to match unix file standards
  $txtContent .= "\n";

  $txtPath = preg_replace('/\.xml$/i', '.txt', $_GET['fname']);
  if ($txtPath && $txtPath !== $_GET['fname']) {
    file_put_contents($txtPath, $txtContent);
    // Optionally chmod to ensure writable by both? 
    // chmod($txtPath, 0666);
  }

} catch (Exception $e) {
  // Silently ignore or append warning?
  // $resp->message .= " [TXT Sync warning: ".$e->getMessage()."]";
}
/// SYNC TXT FILE END ///

/// Commit to git repository ///
if (file_exists('/var/www/nw-page-editor/data/.git/config')) {
  $pid = trim(file_get_contents($ddir . '/pid'));
  if (!$pid || !posix_getpgid(intval($pid))) {
    //$resp->code = 400;
    $resp->message = 'git-commit-daemon apparently not running. Current changes saved in server, but not committed.';
    echo json_encode($resp) . "\n";
    exit($resp->code);
  }

  /// Monitor daemon finished list ///
  $tail = proc_open('tail --pid=$$ -fn 0 ' . $ddir . '/git-commit-done', array(1 => array('pipe', 'w')), $pipes);
  $job_id = $_GET['uname'] . ':' . $_GET['brhash'] . ':' . $_GET['page_editor_version'] . ':' . $_GET['fname'];

  /// Add XML to daemon queue ///
  file_put_contents($ddir . '/git-commit-queue', $job_id . "\n", FILE_APPEND | LOCK_EX);

  /// Wait until daemon finishes processing the requested page ///
  while (!feof($pipes[1])) {
    $line = fgets($pipes[1]);
    list($name, $rc, $msg) = explode(' ', trim($line), 3) + array(NULL, NULL);
    if ($name == $job_id)
      break;
  }
  posix_kill(proc_get_status($tail)['pid'], 9);
  proc_close($tail);

  if ($rc != 0) {
    $resp->code = 400;
    $resp->message = 'Problems committing to git repository: ' . $msg;
  }
}

echo json_encode($resp) . "\n";
exit($resp->code);
?>