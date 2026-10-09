Add-Type -AssemblyName System.Drawing

$src = "C:\Users\presi\.gemini\antigravity-ide\brain\9573d87f-bc84-4bb1-ad96-017e3623c393\app_icon_design_1791458532590.jpg"
$iconsDir = "c:\Users\presi\OneDrive\Desktop\nodebots\twitterbot\build\icons"
$buildDir = "c:\Users\presi\OneDrive\Desktop\nodebots\twitterbot\build"

if (!(Test-Path $iconsDir)) { New-Item -ItemType Directory -Path $iconsDir -Force }

$img = [System.Drawing.Image]::FromFile($src)

# Save 512x512 PNG
$bmp512 = New-Object System.Drawing.Bitmap($img, 512, 512)
$bmp512.Save("$iconsDir\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp512.Save("$buildDir\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)

# Save 256x256 Icon
$bmp256 = New-Object System.Drawing.Bitmap($img, 256, 256)
$hIcon = $bmp256.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)

$icoStream = New-Object System.IO.FileStream("$iconsDir\icon.ico", [System.IO.FileMode]::Create)
$icon.Save($icoStream)
$icoStream.Close()

$icoStreamBuild = New-Object System.IO.FileStream("$buildDir\icon.ico", [System.IO.FileMode]::Create)
$icon.Save($icoStreamBuild)
$icoStreamBuild.Close()

Write-Host "🎨 Successfully generated 512x512 PNG and 256x256 ICO application icons!"
