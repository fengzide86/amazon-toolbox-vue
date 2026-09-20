# Read the existing .lnk with explicit Unicode COM interfaces. Never Resolve,
# Save, execute the target, or infer the target from its expected installation.
if (-not ('Kst.ShortcutInspection.Reader' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

namespace Kst.ShortcutInspection {
    [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IShellLinkW {
        // GetPath is the first IShellLinkW method after IUnknown. No later
        // methods are exposed because this inspector must not repair a link.
        [PreserveSig]
        int GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path,
                    int capacity, IntPtr findData, uint flags);
    }

    public static class Reader {
        public static string ReadTarget(string shortcutPath) {
            string filename = Path.GetFullPath(shortcutPath);
            if (!File.Exists(filename)) throw new FileNotFoundException("Shortcut does not exist", filename);
            object instance = Activator.CreateInstance(Type.GetTypeFromCLSID(
                new Guid("00021401-0000-0000-C000-000000000046"), true));
            try {
                ((IPersistFile)instance).Load(filename, 0); // STGM_READ; no Save/Resolve.
                StringBuilder target = new StringBuilder(32768);
                int result = ((IShellLinkW)instance).GetPath(target, target.Capacity, IntPtr.Zero, 4); // SLGP_RAWPATH
                // S_FALSE is not an exception in default COM interop, but it
                // means no target was retrieved and must fail this gate.
                if (result != 0 || String.IsNullOrWhiteSpace(target.ToString())) {
                    throw new InvalidDataException(String.Format(
                        "IShellLinkW.GetPath did not return a target (HRESULT 0x{0:X8}): {1}", result, filename));
                }
                return target.ToString();
            } finally {
                if (instance != null && Marshal.IsComObject(instance)) Marshal.FinalReleaseComObject(instance);
            }
        }
    }
}
'@
}

function Get-WindowsShortcutTarget([string]$ShortcutPath) {
    return [Kst.ShortcutInspection.Reader]::ReadTarget($ShortcutPath)
}
