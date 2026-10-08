param([string]$AppDir, [string]$OutDir, [string]$Cet)
$ErrorActionPreference = 'Continue'
# ffmpeg 定位（本机适配）：优先环境变量 FFMPEG，其次 PATH，最后回退到已知安装位置。
# 说明：该 ffmpeg 是四级/六级两套项目共用的外部工具，实际安装在 CET6 目录下，故回退路径指向那里。
$ff = $env:FFMPEG
if (-not $ff) { $c = Get-Command ffmpeg -ErrorAction SilentlyContinue; if ($c) { $ff = $c.Source } }
if (-not $ff) { $ff = 'D:\CET6\tools\ffmpeg\ffmpeg-9.0.2-full_build\bin\ffmpeg.exe' }
if (-not (Test-Path $ff)) { Write-Output "FAIL ffmpeg-not-found path=$ff"; exit 2 }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$ids = (node "$PSScriptRoot\convert_audio.js" $AppDir $OutDir 2>$null) -split '\s+' | Where-Object { $_ }
$ok = 0; $fail = @()
foreach ($id in $ids) {
  $url = "https://listening.lazynote.cn/$Cet/$id/index.m3u8"
  $out = Join-Path $OutDir "$id.m4a"
  & $ff -y -loglevel error -i $url -vn -ac 1 -b:a 48k -c:a aac -movflags +faststart $out 2>&1 | Out-Null
  if ((Test-Path $out) -and (Get-Item $out).Length -gt 100KB) { $ok++; Write-Output "OK $id" }
  else { $fail += $id; Write-Output "FAIL $id" }
}
Write-Output "DONE ok=$ok fail=$($fail.Count) failed_ids=$($fail -join ',')"
