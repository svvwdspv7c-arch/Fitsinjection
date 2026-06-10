/*
 * Unistellar Injector
 * Version 2.3-alpha
 * Released June 9, 2026
 *
 * Copyright © 2026 Michael R. Stewardson
 *
 * Batch metadata injection tool for Unistellar FITS files.
 *
 * Notes:
 * - Adds telescope model selection for supported Unistellar scopes.
 * - eVscope 2 is the default profile.
 * - Pixel size is written as an effective pixel size based on the selected
 *   telescope profile and the selected drizzle scale.
 * - Also includes safer cross-platform path handling for macOS/Windows/Linux.
 */

#engine v8

#feature-id    Unistellar > Unistellar Injector
#feature-info  Unistellar Injector

#include <pjsr/UndoFlag.jsh>

// -----------------------------------------------------------------------------
// Telescope profiles
// -----------------------------------------------------------------------------

var TELESCOPE_PROFILES = [
   {
      name: "eVscope 2",
      instrument: "Unistellar eVscope 2",
      telescope: "Unistellar eVscope 2",
      pixelSize: 2.9,
      focalLength: 450,
      focalRatio: "f/4"
   },
   {
      name: "eQuinox 2",
      instrument: "Unistellar eQuinox 2",
      telescope: "Unistellar eQuinox 2",
      pixelSize: 2.9,
      focalLength: 450,
      focalRatio: "f/4"
   },
   {
      name: "Odyssey",
      instrument: "Unistellar Odyssey",
      telescope: "Unistellar Odyssey",
      pixelSize: 1.45,
      focalLength: 320,
      focalRatio: "f/3.9"
   },
   {
      name: "Odyssey Pro",
      instrument: "Unistellar Odyssey Pro",
      telescope: "Unistellar Odyssey Pro",
      pixelSize: 1.45,
      focalLength: 320,
      focalRatio: "f/3.9"
   }
];

var DEFAULT_TELESCOPE_INDEX = 0; // eVscope 2

// -----------------------------------------------------------------------------
// General helpers
// -----------------------------------------------------------------------------

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

function normalizePath(path)
{
   return String(path).replace(/\\/g, "/");
}

function trimTrailingSlash(path)
{
   let p = normalizePath(path);

   while (p.length > 1 && p.charAt(p.length - 1) == "/")
      p = p.substring(0, p.length - 1);

   return p;
}

function joinPath(a, b)
{
   return trimTrailingSlash(a) + "/" + String(b).replace(/^\/+/, "");
}

function parentFolder(path)
{
   let p = trimTrailingSlash(path);
   let i = p.lastIndexOf("/");

   if (i < 0)
      return "";

   if (i == 2 && p.charAt(1) == ":")
      return p.substring(0, 3);

   if (i == 0)
      return "/";

   return p.substring(0, i);
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
   let p = String(path).toLowerCase();
   return p.endsWith(".fits") || p.endsWith(".fit") || p.endsWith(".fts");
}

// -----------------------------------------------------------------------------
// File discovery
// -----------------------------------------------------------------------------

function findFilesRecursive(root, results)
{
   let folder = trimTrailingSlash(root);
   let ff = new FileFind;

   if (!ff.begin(joinPath(folder, "*")))
      return;

   do
   {
      if (ff.name == "." || ff.name == "..")
         continue;

      if (ff.name.charAt(0) == ".")
         continue;

      let path = joinPath(folder, ff.name);

      if (ff.isDirectory)
         findFilesRecursive(path, results);
      else if (isFitsFile(path))
         results.push(path);

   } while (ff.next());

   ff.end();
}

function findManifestRecursive(folder)
{
   let root = trimTrailingSlash(folder);
   let ff = new FileFind;

   if (!ff.begin(joinPath(root, "*")))
      return "";

   do
   {
      if (ff.name == "." || ff.name == "..")
         continue;

      if (ff.name.charAt(0) == ".")
         continue;

      let path = joinPath(root, ff.name);

      if (ff.isDirectory)
      {
         let found = findManifestRecursive(path);
         if (found != "")
         {
            ff.end();
            return found;
         }
      }
      else if (ff.name == "manifest.json")
      {
         ff.end();
         return path;
      }

   } while (ff.next());

   ff.end();
   return "";
}

function findManifestForFits(path)
{
   let folder = parentFolder(path);

   for (let i = 0; i < 6; ++i)
   {
      let direct = joinPath(folder, "manifest.json");
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

// -----------------------------------------------------------------------------
// Dark mean conversion
// -----------------------------------------------------------------------------

function looksLikeDarkMean(path)
{
   let p = String(path).toLowerCase();
   return isFitsFile(path) && p.indexOf("dark") >= 0 && p.indexOf("mean") >= 0;
}

function createMasterDarkFromMean(files)
{
   for (let i = 0; i < files.length; ++i)
   {
      if (!looksLikeDarkMean(files[i]))
         continue;

      let src = files[i];
      let dst = joinPath(parentFolder(src), "MasterDark_from_DarkMean.xisf");

      if (File.exists(dst))
      {
         console.warningln("Master dark already exists. Skipped: " + dst);
         return;
      }

      try
      {
         let windows = ImageWindow.open(src);

         if (windows.length < 1)
            throw new Error("Could not open dark mean frame.");

         let w = windows[0];
         w.saveAs(dst, false, false, false, false);
         w.forceClose();

         console.noteln("Created master dark: " + dst);
         return;
      }
      catch (e)
      {
         console.criticalln("Could not create master dark from: " + src);
         console.criticalln(e.toString());
         return;
      }
   }

   console.warningln("No dark mean frame found. Master dark skipped.");
}

// -----------------------------------------------------------------------------
// Dialog
// -----------------------------------------------------------------------------

class OptionsDialog extends Dialog
{
   constructor()
   {
      super();

      this.windowTitle = "Unistellar Injector Options";
      this.rootPath = "";

      let title = new Label(this);
      title.text = "<b>Unistellar Injector</b>";
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

      let telescopeGroup = new GroupBox(this);
      telescopeGroup.title = "Telescope profile";

      this.scopeCombo = new ComboBox(telescopeGroup);
      for (let i = 0; i < TELESCOPE_PROFILES.length; ++i)
         this.scopeCombo.addItem(TELESCOPE_PROFILES[i].name);
      this.scopeCombo.currentItem = DEFAULT_TELESCOPE_INDEX;

      this.scopeInfo = new Label(telescopeGroup);
      this.scopeInfo.useRichText = true;
      this.scopeInfo.wordWrapping = true;

      this.updateScopeInfo = () =>
      {
         let p = TELESCOPE_PROFILES[this.scopeCombo.currentItem];
         this.scopeInfo.text =
            "<b>Selected:</b> " + p.name + "<br>" +
            "Native pixel size: " + p.pixelSize + " µm<br>" +
            "Focal length: " + p.focalLength + " mm<br>" +
            "Focal ratio: " + p.focalRatio;
      };

      this.scopeCombo.onItemSelected = () =>
      {
         this.updateScopeInfo();

         if (this.updatePixelMathInfo !== undefined)
            this.updatePixelMathInfo();
      };

      this.updateScopeInfo();

      let telescopeSizer = new VerticalSizer;
      telescopeSizer.margin = 8;
      telescopeSizer.spacing = 6;
      telescopeSizer.add(this.scopeCombo);
      telescopeSizer.add(this.scopeInfo);
      telescopeGroup.sizer = telescopeSizer;

      this.masterDarkCheck = new CheckBox(this);
      this.masterDarkCheck.text = "Create master dark from dark mean frame if found";
      this.masterDarkCheck.checked = true;

      this.bayerCheck = new CheckBox(this);
      this.bayerCheck.text = "Override Bayer pattern to GBRG";
      this.bayerCheck.checked = true;

      let pixelGroup = new GroupBox(this);
      pixelGroup.title = "Effective pixel size / drizzle scale";

      this.nativeRadio = new RadioButton(pixelGroup);
      this.nativeRadio.text = "Native / no drizzle";
      this.nativeRadio.checked = true;

      this.drizzle2Radio = new RadioButton(pixelGroup);
      this.drizzle2Radio.text = "2x drizzle";

      this.drizzle3Radio = new RadioButton(pixelGroup);
      this.drizzle3Radio.text = "3x drizzle";

      this.pixelMathInfo = new Label(pixelGroup);
      this.pixelMathInfo.useRichText = true;
      this.pixelMathInfo.wordWrapping = true;

      this.currentDrizzleScale = () =>
      {
         if (this.drizzle2Radio.checked)
            return 2.0;

         if (this.drizzle3Radio.checked)
            return 3.0;

         return 1.0;
      };

      this.updatePixelMathInfo = () =>
      {
         let p = TELESCOPE_PROFILES[this.scopeCombo.currentItem];
         let scale = this.currentDrizzleScale();
         let effective = p.pixelSize / scale;

         this.pixelMathInfo.text =
            "<b>Pixel size written to FITS:</b> " + effective.toFixed(4) + " µm<br>" +
            "Math: " + p.pixelSize.toFixed(4) + " µm / " + scale.toFixed(0) + " = " + effective.toFixed(4) + " µm";
      };

      this.nativeRadio.onCheck = () =>
      {
         this.updatePixelMathInfo();
      };

      this.drizzle2Radio.onCheck = () =>
      {
         this.updatePixelMathInfo();
      };

      this.drizzle3Radio.onCheck = () =>
      {
         this.updatePixelMathInfo();
      };

      let pgSizer = new VerticalSizer;
      pgSizer.margin = 8;
      pgSizer.spacing = 4;
      pgSizer.add(this.nativeRadio);
      pgSizer.add(this.drizzle2Radio);
      pgSizer.add(this.drizzle3Radio);
      pgSizer.addSpacing(6);
      pgSizer.add(this.pixelMathInfo);
      pixelGroup.sizer = pgSizer;

      this.updatePixelMathInfo();

      let warning = new Label(this);
      warning.text =
"<b>IMPORTANT:</b><br><br>" +
"The telescope profile writes the native focal length and base pixel size for the selected Unistellar model.<br><br>" +
"The drizzle setting writes the <b>effective</b> pixel size used later by plate solving and SPCC:<br>" +
"Native = selected scope pixel size<br>" +
"2x drizzle = selected scope pixel size / 2<br>" +
"3x drizzle = selected scope pixel size / 3<br><br>" +
"If the selected scale does not match the actual drizzle scale used during integration, ImageSolver and SPCC may not work correctly.";
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
      this.sizer.add(telescopeGroup);
      this.sizer.add(this.masterDarkCheck);
      this.sizer.add(this.bayerCheck);
      this.sizer.add(pixelGroup);
      this.sizer.add(warning);
      this.sizer.add(buttonSizer);

      this.adjustToContents();
   }
}

// -----------------------------------------------------------------------------
// Main processing
// -----------------------------------------------------------------------------

function main()
{
   console.writeln();
   console.writeln("================================================");
   console.writeln("Unistellar Injector");
   console.writeln("Version 2.3-alpha");
   console.writeln("Released June 9, 2026");
   console.writeln("© 2026 Michael R. Stewardson");
   console.writeln("================================================");
   console.writeln("");

   let dialog = new OptionsDialog;

   if (!dialog.execute())
   {
      console.writeln("Canceled.");
      return;
   }

   let root = trimTrailingSlash(dialog.rootPath);
   let createMasterDark = dialog.masterDarkCheck.checked;
   let overrideBayer = dialog.bayerCheck.checked;
   let profile = TELESCOPE_PROFILES[dialog.scopeCombo.currentItem];

   let drizzleScale = 1.0;
   if (dialog.drizzle2Radio.checked)
      drizzleScale = 2.0;
   else if (dialog.drizzle3Radio.checked)
      drizzleScale = 3.0;

   let effectivePixelSize = profile.pixelSize / drizzleScale;

   let files = [];
   findFilesRecursive(root, files);

   console.writeln("Root: " + root);
   console.writeln("FITS files found: " + files.length);
   console.writeln("Telescope: " + profile.name);
   console.writeln("Native pixel size: " + profile.pixelSize + " um");
   console.writeln("Drizzle scale: " + drizzleScale + "x");
   console.writeln("Effective pixel size: " + effectivePixelSize + " um");
   console.writeln("Focal length: " + profile.focalLength + " mm");
   console.writeln("Create master dark: " + createMasterDark);
   console.writeln("Override Bayer GBRG: " + overrideBayer);

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

   if (createMasterDark)
      createMasterDarkFromMean(files);

   let ok = 0;
   let failed = 0;
   let skippedNoManifest = 0;
   let alreadyProcessed = 0;

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
            console.warningln("  No manifest found. Skipped.");
            continue;
         }

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

         k = setKeyword(k, "UNIHDR",   q("v2.3-alpha"), "Processed by Unistellar Injector");
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

         k = setKeyword(k, "PIXSIZE",  String(effectivePixelSize), "Effective pixel size, microns");
         k = setKeyword(k, "XPIXSZ",   String(effectivePixelSize), "Effective pixel size, X axis, microns");
         k = setKeyword(k, "YPIXSZ",   String(effectivePixelSize), "Effective pixel size, Y axis, microns");
         k = setKeyword(k, "NATPIXSZ", String(profile.pixelSize), "Native telescope pixel size, microns");
         k = setKeyword(k, "DRIZZLE",  String(drizzleScale), "Selected drizzle scale for effective pixel metadata");

         k = setKeyword(k, "EXPTIME",  String(exposureSeconds), "Exposure time, seconds");
         k = setKeyword(k, "GAIN",     String(m.gain), "Sensor gain from Unistellar manifest");

         k = setKeyword(k, "OBSGEO-B", String(m.lat), "Observer geodetic latitude, degrees");
         k = setKeyword(k, "OBSGEO-L", String(m.long), "Observer geodetic longitude, degrees");
         k = setKeyword(k, "OBSGEO-H", String(m.alt), "Observer elevation, meters");

         k = setKeyword(k, "FOCALLEN", String(profile.focalLength), "Focal length, mm");
         k = setKeyword(k, "FOCRATIO", q(profile.focalRatio), "Focal ratio");

         if (overrideBayer)
         {
            k = setKeyword(k, "CFAIMAGE", q("T"), "Image is CFA/Bayer mosaic data");
            k = setKeyword(k, "BAYERPAT", q("GBRG"), "Corrected Bayer pattern for PixInsight processing");
            k = setKeyword(k, "XBAYROFF", "0", "Bayer pattern X offset");
            k = setKeyword(k, "YBAYROFF", "0", "Bayer pattern Y offset");
         }

         k = setKeyword(k, "INSTRUME", q(profile.instrument), "Instrument");
         k = setKeyword(k, "TELESCOP", q(profile.telescope), "Telescope");

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
   console.writeln("Updated: " + ok);
   console.writeln("Skipped, no manifest: " + skippedNoManifest);
   console.writeln("Already had UNIHDR marker: " + alreadyProcessed);
   console.writeln("Failed:  " + failed);
   console.writeln("===== End =====");
}

main();
