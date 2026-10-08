$sets = @()
foreach ($y in 2015..2019) { foreach ($m in @('06','12')) { foreach ($n in 1..3) { $sets += "$y-$m-$n" } } }
$sets += @('2020-07-1','2020-09-1','2020-09-2','2020-09-3','2020-12-1','2020-12-2','2020-12-3')
foreach ($y in 2021..2021) { foreach ($m in @('06','12')) { foreach ($n in 1..3) { $sets += "$y-$m-$n" } } }
$sets += @('2022-06-1','2022-06-2','2022-06-3','2022-09-1','2022-09-2','2022-09-3','2022-12-1','2022-12-2','2022-12-3')
$sets += @('2023-03-1','2023-03-2','2023-03-3','2023-06-1','2023-06-2','2023-06-3','2023-12-1','2023-12-2','2023-12-3')
foreach ($y in 2024..2025) { foreach ($m in @('06','12')) { foreach ($n in 1..3) { $sets += "$y-$m-$n" } } }
$sets += @('2026-06-1','2026-06-2','2026-06-3')

$BASE = (Join-Path $PSScriptRoot '..\papers')
New-Item -ItemType Directory -Path $BASE -Force | Out-Null
$logFile = "$BASE\download.log"
$ok = 0; $fail = 0; $skip = 0; $i = 0
$total = $sets.Count
"START $total sets | $(Get-Date -Format 'HH:mm:ss')" | Out-File $logFile -Encoding ascii

# URL-encoded markers: 真题（整卷）.docx and 真题及答案解析（整卷）.pdf
$docxPat = 'E7%9C%9F%E9%A2%98%EF%BC%88%E6%95%B4%E5%8D%B7%EF%BC%89\.docx'
$pdfPat = 'E8%A7%A3%E6%9E%90%EF%BC%88%E6%95%B4%E5%8D%B7%EF%BC%89\.pdf'

foreach ($s in $sets) {
  $i++
  foreach ($kind in @('docx','pdf')) {
    $ext = if ($kind -eq 'docx') { '.docx' } else { '.pdf' }
    $out = if ($kind -eq 'docx') { "$BASE\cet4-$s.docx" } else { "$BASE\cet4-$s-解析.pdf" }
    if ((Test-Path $out) -and (Get-Item $out).Length -gt 10000) { $skip++; continue }
    try {
      $page = Invoke-WebRequest -Uri "https://english-exam.lazynote.cn/cet4/paper/$s/?f=w" -UseBasicParsing -TimeoutSec 30
      $links = [regex]::Matches($page.Content, 'href="([^"]*downloads\.lazynote\.cn[^"]*)"') | ForEach-Object { $_.Groups[1].Value }
      $pat = if ($kind -eq 'docx') { $docxPat } else { $pdfPat }
      $target = $null
      foreach ($l in $links) { if ($l -match $pat) { $target = $l; break } }
      if (-not $target) { throw "no $kind link" }
      Invoke-WebRequest -Uri $target -OutFile $out -TimeoutSec 120
      $size = (Get-Item $out).Length
      $ok++
      "[$i/$total] OK $s $kind ($size B)" | Out-File $logFile -Append -Encoding ascii
    } catch {
      $fail++
      $msg = $_.Exception.Message; if ($msg.Length -gt 60) { $msg = $msg.Substring(0,60) }
      "[$i/$total] FAIL $s $kind : $msg" | Out-File $logFile -Append -Encoding ascii
    }
    Start-Sleep -Milliseconds 300
  }
}
"DONE: OK=$ok FAIL=$fail SKIP=$skip | $(Get-Date -Format 'HH:mm:ss')" | Out-File $logFile -Append -Encoding ascii
Write-Output "DONE: OK=$ok FAIL=$fail SKIP=$skip"
