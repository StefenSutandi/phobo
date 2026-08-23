<#
.SYNOPSIS
    Inspects Windows printer configuration and PrintTicket settings for Canon SELPHY CP1500.
.DESCRIPTION
    Reports printer name, driver name, paper size, orientation, N-up/PagesPerSheet, scaling, and borderless features.
    Use this script on the physical Mini PC to diagnose driver-level scaling or N-up issues.
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\inspect-printer-config.ps1
#>

[CmdletBinding()]
param (
    [string]$TargetPrinter = $env:PHOBO_PRINTER_NAME
)

if (-not $TargetPrinter) {
    $TargetPrinter = "Canon SELPHY CP1500"
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "PHOBO PRINTER CONFIGURATION & PRINTTICKET AUDIT" -ForegroundColor Cyan
Write-Host "Target Printer: $TargetPrinter" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Inspect Printer via System.Drawing.Printing
Add-Type -AssemblyName System.Drawing
$installed = [System.Drawing.Printing.PrinterSettings]::InstalledPrinters
$matched = $null
foreach ($p in $installed) {
    if ($p.ToLower() -eq $TargetPrinter.ToLower()) {
        $matched = $p
        break
    }
}

if (-not $matched) {
    Write-Host "❌ Printer '$TargetPrinter' not found among installed printers." -ForegroundColor Red
    Write-Host "Available printers:"
    $installed | ForEach-Object { Write-Host " - $_" }
    exit 1
}

Write-Host "`n[1. System.Drawing Driver Settings]" -ForegroundColor Green
$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.PrinterSettings.PrinterName = $matched

Write-Host "Printer Name: $($doc.PrinterSettings.PrinterName)"
Write-Host "Is Valid: $($doc.PrinterSettings.IsValid)"
Write-Host "Is Default: $($doc.PrinterSettings.IsDefaultPrinter)"
Write-Host "Default Paper: $($doc.DefaultPageSettings.PaperSize.PaperName) ($($doc.DefaultPageSettings.PaperSize.Width)x$($doc.DefaultPageSettings.PaperSize.Height))"
Write-Host "Default Landscape: $($doc.DefaultPageSettings.Landscape)"
Write-Host "Default Margins: L=$($doc.DefaultPageSettings.Margins.Left), T=$($doc.DefaultPageSettings.Margins.Top), R=$($doc.DefaultPageSettings.Margins.Right), B=$($doc.DefaultPageSettings.Margins.Bottom)"
Write-Host "Hard Margins: X=$($doc.DefaultPageSettings.HardMarginX), Y=$($doc.DefaultPageSettings.HardMarginY)"
Write-Host "Printable Area: X=$($doc.DefaultPageSettings.PrintableArea.X), Y=$($doc.DefaultPageSettings.PrintableArea.Y), W=$($doc.DefaultPageSettings.PrintableArea.Width), H=$($doc.DefaultPageSettings.PrintableArea.Height)"
Write-Host "Color Capable: $($doc.PrinterSettings.SupportsColor)"

Write-Host "`nAvailable Paper Sizes in Driver:"
try {
    foreach ($ps in $doc.PrinterSettings.PaperSizes) {
        Write-Host " - $($ps.PaperName) ($($ps.Width) x $($ps.Height) hundredths of inch, RawKind=$($ps.RawKind))"
    }
} catch {
    Write-Host " (Unable to enumerate PaperSizes: $_)"
}

# 2. Inspect Windows Print Management API (Get-Printer / Get-PrintConfiguration)
Write-Host "`n[2. Windows Print Configuration]" -ForegroundColor Green
if (Get-Command Get-Printer -ErrorAction SilentlyContinue) {
    try {
        $printerObj = Get-Printer -Name $matched -ErrorAction SilentlyContinue
        if ($printerObj) {
            Write-Host "Driver Name: $($printerObj.DriverName)"
            Write-Host "Port Name: $($printerObj.PortName)"
            Write-Host "Shared: $($printerObj.Shared)"
            Write-Host "Printer Status: $($printerObj.PrinterStatus)"
        }

        $printConfig = Get-PrintConfiguration -PrinterName $matched -ErrorAction SilentlyContinue
        if ($printConfig) {
            Write-Host "PaperSize: $($printConfig.PaperSize)"
            Write-Host "Orientation: $($printConfig.Orientation)"
            Write-Host "Collate: $($printConfig.Collate)"
            Write-Host "Color: $($printConfig.Color)"
            Write-Host "DuplexingMode: $($printConfig.DuplexingMode)"
            if ($printConfig.PrintTicketXML) {
                Write-Host "`nPrintTicket XML Keyword Search (N-Up, Scaling, Borderless):"
                $xml = $printConfig.PrintTicketXML
                $keywords = @("NUp", "PagesPerSheet", "Scaling", "PageScaling", "FitToPage", "Borderless", "MediaSize", "PageMediaSize", "PageOrientation")
                foreach ($kw in $keywords) {
                    if ($xml -match "(<[^>]*$kw[^>]*>[\s\S]*?<\/[^>]*$kw[^>]*>|<[^>]*$kw[^>]*\/>)") {
                        Write-Host "  [$kw Match]: $($Matches[0].Trim())" -ForegroundColor Yellow
                    }
                }
            }
        }
    } catch {
        Write-Host " (Print management query failed: $_)"
    }
} else {
    Write-Host " Get-Printer / Get-PrintConfiguration cmdlet not available in this PowerShell version."
}

# 3. System.Printing PrintTicket Inspection
Write-Host "`n[3. System.Printing Managed PrintTicket Inspection]" -ForegroundColor Green
try {
    Add-Type -AssemblyName ReachFramework -ErrorAction SilentlyContinue
    Add-Type -AssemblyName System.Printing -ErrorAction SilentlyContinue
    $localServer = New-Object System.Printing.LocalPrintServer
    $pq = $localServer.GetPrintQueue($matched)
    if ($pq) {
        $ticket = $pq.UserPrintTicket
        if ($ticket) {
            Write-Host "PageOrientation: $($ticket.PageOrientation)"
            Write-Host "PageMediaSize: $($ticket.PageMediaSize.PageMediaSizeName) (W=$($ticket.PageMediaSize.Width), H=$($ticket.PageMediaSize.Height))"
            Write-Host "PagesPerSheet: $($ticket.PagesPerSheet)"
            Write-Host "PageScaling: $($ticket.PageScaling)"
            Write-Host "PageBorderless: $($ticket.PageBorderless)"
            Write-Host "OutputQuality: $($ticket.OutputQuality)"
        }
    }
} catch {
    Write-Host " (System.Printing inspection not supported or error: $_)"
}

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "AUDIT COMPLETE" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
