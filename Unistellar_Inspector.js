/*
 * EVScope FITS Injector
 * Version 2.1
 * Released June 7, 2026
 *
 * Copyright © 2026 Michael R. Stewardson
 *
 * Batch metadata injection tool for Unistellar eVscope FITS files.
 */

#engine v8

#feature-id    Unistellar > EVScope FITS Injector
#feature-info  EVScope FITS Injector

#include <pjsr/UndoFlag.jsh>

function q(s)
{
   return "'" + String(s).replace(/'/g, "") + "'";
}

function msToISO(ms)
{
   if (ms === undefined || ms === null || ms === 0)
      return "";
   return new Date(ms).toISOString();
}

function hasKeyword(keywords, name)
{
   for (let i = 0; i < keywords.length; ++i)
      if (keywords[i].name == name)
         return true;
   return false;
}

function setKeyword(keywords, name, value, comment)
{
   let out = [];

   for (let i = 0; i < keywords.length; ++i)
      if (keywords[i].name != name)
         out.push(keywords[i]);

   out.push(new FITSKeyword(name, value, comment));
   return out;
}

function isFitsFile(path)
{
   let p = path.toLowerCase();
   return p.endsWith(".fits") || p.endsWith(".fit") || p.endsWith(".fts");
}

function parentFolder(path)
{
   let i = path.lastIndexOf("/");
   if (i < 0)
      return "";
   return path.substring(0, i);
}

function findFilesRecursive(root, results)
{
   let ff = new FileFind;

   if (!ff.begin(root + "/*"))
      return;

   do
   {
      if (ff.name == "." || ff.name == "..")
         continue;

      if (ff.name.charAt(0) == ".")
         continue;

      let path = root + "/" + ff.name;

      if (ff.isDirectory)
         findFilesRecursive(path, results);
      else if (isFitsFile(path))
         results.push(path);

   } while (ff.next());

   ff.end();
}

function findManifestRecursive(folder)
{
   let ff = new FileFind;

   if (!ff.begin(folder + "/*"))
      return "";

   do
   {
      if (ff.name == "." || ff.name == "..")
         continue;

      if (ff.name.charAt(0) == ".")
         continue;

      let path = folder + "/" + ff.name;

      if (ff.isDirectory)
      {
         let found = findManifestRecursive(path);
         if (found != "")
         {
            ff.end();
            return found;
         }
      }
      else
      {
         if (ff.name == "manifest.json")
         {
            ff.end();
            return path;
         }
      }

   } while (ff.next());

   ff.end();
   return "";
}


function isDarkMeanName(name)
{
   let n = String(name).toLowerCase();
   return n.indexOf("darkmean") >= 0 &&
          (n.endsWith(".fits") || n.endsWith(".fit") || n.endsWith(".fts"));
}

function isMasterDarkFromDarkMeanName(name)
{
   let n = String(name).toLowerCase();
   return n == "masterdark_from_darkmean.xisf";
}

function findFirstByNameRecursive(folder, matcher)
{
   let ff = new FileFind;

   if (!ff.begin(folder + "/*"))
      return "";

   do
   {
      if (ff.name == "." || ff.name == "..")
         continue;

      if (ff.name.charAt(0) == ".")
         continue;

      let path = folder + "/" + ff.name;

      if (ff.isDirectory)
      {
         let found = findFirstByNameRecursive(path, matcher);
         if (found != "")
         {
            ff.end();
            return found;
         }
      }
      else if (matcher(ff.name))
      {
         ff.end();
         return path;
      }

   } while (ff.next());

   ff.end();
   return "";
}

function findDarkMeanStatus(folder)
{
   return findFirstByNameRecursive(folder, isDarkMeanName);
}

function findMasterDarkFromDarkMeanStatus(folder)
{
   return findFirstByNameRecursive(folder, isMasterDarkFromDarkMeanName);
}

function findManifestForFits(path)
{
   let folder = parentFolder(path);

   for (let i = 0; i < 6; ++i)
   {
      let direct = folder + "/manifest.json";
      if (File.exists(direct))
         return direct;

      let siblingSearch = findManifestRecursive(folder);
      if (siblingSearch != "")
         return siblingSearch;

      let p = parentFolder(folder);
      if (p == "" || p == folder)
         break;

      folder = p;
   }

   return "";
}

function looksLikeDarkMean(path)
{
   let p = path.toLowerCase();
   return isFitsFile(path) && p.indexOf("dark") >= 0 && p.indexOf("mean") >= 0;
}

function createMasterDarkFromMean(files)
{
   let status = {
      darkMeanDetected: false,
      darkMasterCreated: false
   };

   for (let i = 0; i < files.length; ++i)
   {
      if (!looksLikeDarkMean(files[i]))
         continue;

      status.darkMeanDetected = true;

      let src = files[i];
      let dst = parentFolder(src) + "/MasterDark_from_DarkMean.xisf";

      if (File.exists(dst))
      {
         console.warningln("Master dark already exists. Skipped: " + dst);
         return status;
      }

      try
      {
         let windows = ImageWindow.open(src);

         if (windows.length < 1)
            throw new Error("Could not open dark mean frame.");

         let w = windows[0];
         w.saveAs(dst, false, false, false, false);
         w.forceClose();

         status.darkMasterCreated = true;
         console.noteln("Created master dark: " + dst);
         return status;
      }
      catch (e)
      {
         console.criticalln("Could not create master dark from: " + src);
         console.criticalln(e.toString());
         return status;
      }
   }

   console.warningln("No dark mean frame found. Master dark skipped.");
   return status;
}


function unistellarModelName(index)
{
   if (index == 1)
      return "Unistellar eQuinox 2";
   if (index == 2)
      return "Unistellar Odyssey";
   if (index == 3)
      return "Unistellar Odyssey Pro";

   return "Unistellar eVscope 2";
}

function unistellarModelPixelSize(index)
{
   // Current Unistellar specs:
   // eVscope 2 / eQuinox 2: 2.9 um
   // Odyssey / Odyssey Pro: 1.45 um
   if (index == 2 || index == 3)
      return 1.45;

   return 2.9;
}

function unistellarModelFocalLength(index)
{
   // Current Unistellar specs:
   // eVscope 2 / eQuinox 2: 450 mm
   // Odyssey / Odyssey Pro: 320 mm
   if (index == 2 || index == 3)
      return 320;

   return 450;
}

function drizzleScaleName(scale)
{
   if (scale == 2)
      return "2x drizzle";
   if (scale == 3)
      return "3x drizzle";

   return "native / no drizzle";
}

class OptionsDialog extends Dialog
{
   constructor()
   {
      super();

      this.windowTitle = "EVScope FITS Injector Options";

      this.rootPath = "";

      let title = new Label(this);
      title.text = "<b>EVScope FITS Injector</b>";
      title.useRichText = true;

      let help = new Label(this);
      help.text = "Choose the top-level Unistellar folder. The script will recursively find FITS files and their manifest.json files.";
      help.wordWrapping = true;

      this.pathEdit = new Edit(this);
      this.pathEdit.readOnly = true;

      this.chooseButton = new PushButton(this);
      this.chooseButton.text = "Choose Folder";
      this.chooseButton.onClick = () =>
      {
         let g = new GetDirectoryDialog;
         g.caption = "Select top-level Unistellar folder";

         if (g.execute())
         {
            this.rootPath = g.directoryPath;
            this.pathEdit.text = g.directoryPath;
         }
      };

      let pathSizer = new HorizontalSizer;
      pathSizer.spacing = 6;
      pathSizer.add(this.pathEdit, 100);
      pathSizer.add(this.chooseButton);

      this.masterDarkCheck = new CheckBox(this);
      this.masterDarkCheck.text = "Create master dark from dark mean frame if found";
      this.masterDarkCheck.checked = true;

      this.bayerCheck = new CheckBox(this);
      this.bayerCheck.text = "Override Bayer pattern to GBRG";
      this.bayerCheck.checked = true;

      let scopeGroup = new GroupBox(this);
      scopeGroup.title = "Unistellar telescope model";

      this.scopeCombo = new ComboBox(scopeGroup);
      this.scopeCombo.addItem("eVscope 2  -  2.9 um pixels, 450 mm focal length");
      this.scopeCombo.addItem("eQuinox 2  -  2.9 um pixels, 450 mm focal length");
      this.scopeCombo.addItem("Odyssey  -  1.45 um pixels, 320 mm focal length");
      this.scopeCombo.addItem("Odyssey Pro  -  1.45 um pixels, 320 mm focal length");
      this.scopeCombo.currentItem = 0;

      let scopeSizer = new VerticalSizer;
      scopeSizer.margin = 8;
      scopeSizer.spacing = 4;
      scopeSizer.add(this.scopeCombo);
      scopeGroup.sizer = scopeSizer;

      let pixelGroup = new GroupBox(this);
      pixelGroup.title = "Drizzle / effective pixel size";

      this.nativeRadio = new RadioButton(pixelGroup);
      this.nativeRadio.text = "Native / no drizzle: corrected pixel size = native";
      this.nativeRadio.checked = true;

      this.drizzle2Radio = new RadioButton(pixelGroup);
      this.drizzle2Radio.text = "2x drizzle: corrected pixel size = native / 2";

      this.drizzle3Radio = new RadioButton(pixelGroup);
      this.drizzle3Radio.text = "3x drizzle: corrected pixel size = native / 3";

      let pgSizer = new VerticalSizer;
      pgSizer.margin = 8;
      pgSizer.spacing = 4;
      pgSizer.add(this.nativeRadio);
      pgSizer.add(this.drizzle2Radio);
      pgSizer.add(this.drizzle3Radio);
      pixelGroup.sizer = pgSizer;

      let warning = new Label(this);
      warning.text =
"<b>IMPORTANT:</b><br><br>" +
"Choose the telescope model and the drizzle scale you plan to use when processing this data.<br><br>" +
"The script will calculate the effective pixel size as:<br>" +
"native pixel size / drizzle scale<br><br>" +
"This setting updates the FITS pixel size metadata for future plate solving. " +
"If the selected scale does not match the actual drizzle scale used during integration, " +
"ImageSolver and SPCC may not work correctly.";
      warning.useRichText = true;
      warning.wordWrapping = true;

      this.okButton = new PushButton(this);
      this.okButton.text = "Run";
      this.okButton.onClick = () =>
      {
         if (this.rootPath == "")
         {
            console.warningln("No folder selected.");
            return;
         }

         this.ok();
      };

      this.cancelButton = new PushButton(this);
      this.cancelButton.text = "Cancel";
      this.cancelButton.onClick = () =>
      {
         this.cancel();
      };

      let buttonSizer = new HorizontalSizer;
      buttonSizer.spacing = 6;
      buttonSizer.addStretch();
      buttonSizer.add(this.okButton);
      buttonSizer.add(this.cancelButton);

      this.sizer = new VerticalSizer;
      this.sizer.margin = 10;
      this.sizer.spacing = 8;
      this.sizer.add(title);
      this.sizer.add(help);
      this.sizer.add(pathSizer);
      this.sizer.add(this.masterDarkCheck);
      this.sizer.add(this.bayerCheck);
      this.sizer.add(scopeGroup);
      this.sizer.add(pixelGroup);
      this.sizer.add(warning);
      this.sizer.add(buttonSizer);

      this.adjustToContents();
   }
}

function main()
{
   console.writeln();
   console.writeln("================================================");
   console.writeln("EVScope FITS Injector");
   console.writeln("Version 2.1");
   console.writeln("Released June 7, 2026");
   console.writeln("\u00A9 2026 Michael R. Stewardson");
   console.writeln("================================================");
   console.writeln("");

   let dialog = new OptionsDialog;

   if (!dialog.execute())
   {
      console.writeln("Canceled.");
      return;
   }

   let root = dialog.rootPath;
   let createMasterDark = dialog.masterDarkCheck.checked;
   let overrideBayer = dialog.bayerCheck.checked;

   let modelIndex = dialog.scopeCombo.currentItem;
   let modelName = unistellarModelName(modelIndex);
   let nativePixelSize = unistellarModelPixelSize(modelIndex);
   let focalLength = unistellarModelFocalLength(modelIndex);

   let drizzleScale = 1;

   if (dialog.drizzle2Radio.checked)
      drizzleScale = 2;
   else if (dialog.drizzle3Radio.checked)
      drizzleScale = 3;

   let pixelSize = nativePixelSize / drizzleScale;

   let files = [];
   findFilesRecursive(root, files);

   console.writeln("Root: " + root);
   console.writeln("FITS files found: " + files.length);
   console.writeln("Create master dark: " + createMasterDark);
   console.writeln("Override Bayer GBRG: " + overrideBayer);
   console.writeln("Telescope model: " + modelName);
   console.writeln("Native pixel size: " + nativePixelSize + " um");
   console.writeln("Drizzle setting: " + drizzleScaleName(drizzleScale));
   console.writeln("Effective FITS pixel size written: " + pixelSize + " um");
   console.writeln("Focal length written: " + focalLength + " mm");

   if (files.length < 1)
   {
      console.criticalln("");
      console.criticalln("********************************************************");
      console.criticalln("* ERROR: No FITS files found in selected folder.");
      console.criticalln("*");
      console.criticalln("* Nothing was modified.");
      console.criticalln("* Supported input formats: .fits, .fit, .fts");
      console.criticalln("********************************************************");
      console.criticalln("");
      return;
   }

   let darkMeanDetected = false;
   let darkMasterCreated = false;

   if (createMasterDark)
   {
      let darkStatus = createMasterDarkFromMean(files);
      darkMeanDetected = darkStatus.darkMeanDetected;
      darkMasterCreated = darkStatus.darkMasterCreated;
   }

   let ok = 0;
   let failed = 0;
   let alreadyProcessed = 0;
   let skippedNoManifest = 0;

   for (let i = 0; i < files.length; ++i)
   {
      let path = files[i];

      try
      {
         console.writeln("[" + (i+1) + "/" + files.length + "] " + path);

         let manifestPath = findManifestForFits(path);

         if (manifestPath == "")
         {
            ++skippedNoManifest;
            console.warningln("  MANIFEST STATUS: NOT FOUND - this FITS file was skipped.");
            continue;
         }

         console.writeln("  MANIFEST STATUS: FOUND AND USED");
         console.writeln("  Manifest file: " + manifestPath);

         let m = JSON.parse(File.readTextFile(manifestPath));

         let exposureSeconds = m.expo / 1000000.0;
         let dateObs = msToISO(m.obs_start);
         let dateEnd = msToISO(m.obs_end);

         let windows = ImageWindow.open(path);

         if (windows.length < 1)
            throw new Error("ImageWindow.open returned no windows.");

         let w = windows[0];

         w.mainView.beginProcess(UndoFlag_Keywords);

         let k = w.keywords;

         if (hasKeyword(k, "UNIHDR"))
         {
            ++alreadyProcessed;
            console.writeln("  Already had UNIHDR marker. Updating existing metadata.");
         }

         k = setKeyword(k, "UNIHDR",   q("v2"), "Processed by Unistellar Header Injector");
         k = setKeyword(k, "MANUSED",  q("T"), "Manifest file was found and used for header injection");
         k = setKeyword(k, "OBJECT",   q(m.nameTarget), "Target name from Unistellar manifest");
         k = setKeyword(k, "RA",       String(m.ra), "Right ascension of image center, degrees");
         k = setKeyword(k, "DEC",      String(m.dec), "Declination of image center, degrees");
         k = setKeyword(k, "OBJCTRA",  String(m.ra), "Object right ascension, degrees");
         k = setKeyword(k, "OBJCTDEC", String(m.dec), "Object declination, degrees");
         k = setKeyword(k, "RADESYS",  q("ICRS"), "Celestial coordinate reference system");
         k = setKeyword(k, "EQUINOX",  "2000.0", "Equinox of celestial coordinate system");

         if (dateObs != "")
         {
            k = setKeyword(k, "DATE-OBS", q(dateObs), "Observation start UTC");
            k = setKeyword(k, "DATE-BEG", q(dateObs), "Observation start UTC");
         }

         if (dateEnd != "")
            k = setKeyword(k, "DATE-END", q(dateEnd), "Observation end UTC");

         k = setKeyword(k, "FILTER",   q("OSC"), "One-shot color sensor");
         k = setKeyword(k, "XBINNING", "1", "Binning factor, X axis");
         k = setKeyword(k, "YBINNING", "1", "Binning factor, Y axis");

         k = setKeyword(k, "PIXSIZE",  String(pixelSize), "Effective pixel size, microns");
         k = setKeyword(k, "XPIXSZ",   String(pixelSize), "Pixel size, X axis, microns");
         k = setKeyword(k, "YPIXSZ",   String(pixelSize), "Pixel size, Y axis, microns");

         k = setKeyword(k, "EXPTIME",  String(exposureSeconds), "Exposure time, seconds");
         k = setKeyword(k, "GAIN",     String(m.gain), "Sensor gain from Unistellar manifest");

         k = setKeyword(k, "OBSGEO-B", String(m.lat), "Observer geodetic latitude, degrees");
         k = setKeyword(k, "OBSGEO-L", String(m.long), "Observer geodetic longitude, degrees");
         k = setKeyword(k, "OBSGEO-H", String(m.alt), "Observer elevation, meters");

         k = setKeyword(k, "FOCALLEN", String(focalLength), "Focal length, mm");

         if (overrideBayer)
         {
            k = setKeyword(k, "CFAIMAGE", q("T"), "Image is CFA/Bayer mosaic data");
            k = setKeyword(k, "BAYERPAT", q("GBRG"), "Corrected Bayer pattern for PixInsight processing");
            k = setKeyword(k, "XBAYROFF", "0", "Bayer pattern X offset");
            k = setKeyword(k, "YBAYROFF", "0", "Bayer pattern Y offset");
         }

         k = setKeyword(k, "INSTRUME", q(modelName), "Instrument");
         k = setKeyword(k, "TELESCOP", q(modelName), "Telescope");
         k = setKeyword(k, "DRIZZLE", String(drizzleScale), "Drizzle scale used to calculate effective pixel size");

         if (m.sensor !== undefined)
            k = setKeyword(k, "SENSOR", q(m.sensor), "Sensor from Unistellar manifest");

         w.keywords = k;

         w.mainView.endProcess();

         w.save();
         w.forceClose();

         ++ok;
      }
      catch (e)
      {
         console.criticalln("FAILED: " + path);
         console.criticalln(e.toString());
         ++failed;
      }
   }

   console.writeln();
   console.writeln("===== Write Summary =====");
   console.writeln("Files updated with manifest data: " + ok);
   console.writeln("Files skipped because manifest was NOT found: " + skippedNoManifest);
   console.writeln("Files that already had UNIHDR marker before this run: " + alreadyProcessed);
   console.writeln("Files failed because of an error: " + failed);

   console.writeln("");
   console.writeln("DarkMean frame detected: " + (darkMeanDetected ? "YES" : "NO"));
   console.writeln("MasterDark_from_DarkMean.xisf successfully created: " + (darkMasterCreated ? "YES" : "NO"));

   let darkMeanPath = findDarkMeanStatus(root);
   let darkMeanFound = darkMeanPath != "";

   let masterDarkPath = findMasterDarkFromDarkMeanStatus(root);
   let masterDarkFound = masterDarkPath != "";

   console.writeln("===== End =====");
}

main();
