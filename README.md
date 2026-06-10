# Fitsinjection
Translates and loads data from Unistellar telescope and light frames to standard astronomical fits labels



Unistellar Injector — README
What this script does
Unistellar Injector is a PixInsight script for Unistellar FITS files.
It reads the JSON manifest file that comes with the exported Unistellar data, then translates and updates the FITS headers so PixInsight has better information to work with.
The script can also detect a DarkMean frame and convert it into:
DarkMaster.xfit
This allows the dark frame to be used as a master dark during processing.
Important: keep the manifest file
Do not delete the JSON manifest file.
The manifest contains the information the script uses to update the FITS headers. If the manifest is missing, the script cannot fully translate the Unistellar metadata.
Keep the manifest in the same exported data set with your FITS files.
Installation
Download the script file.
Create a new folder anywhere you would like to keep PixInsight scripts.
Example:
Documents/PixInsightCustomScripts
Place the script file inside that folder.
Adding the script to PixInsight
Open PixInsight.
Go to:
Script > Feature Scripts
Click:
Add
Select the folder where you placed the script.
Click:
Regenerate
After regeneration, the script should appear in the PixInsight script menu.
Basic use
Open the script from the PixInsight script menu.
Select the folder containing your Unistellar FITS files and manifest.
Choose the correct Unistellar telescope model from the dropdown.
Run the script.
The script will update the FITS headers and, if present, process the DarkMean frame into DarkMaster.xfit.
About the GBRG bug
Some Unistellar FITS files may not debayer correctly in PixInsight if PixInsight assumes the wrong Bayer pattern.
The issue appears as incorrect color, often with a magenta/gray look or poor color separation.
For these files, the correct Bayer pattern may need to be set to:
GBRG
This script helps account for that known Unistellar behavior so the files process correctly in PixInsight.
Notes
This is an alpha version and has not been extensively tested.
Make backups before using it on important files. Do not use it directly on your only copy of a data set until you are comfortable with the results.
No warranty is provided. Use at your own risk.
