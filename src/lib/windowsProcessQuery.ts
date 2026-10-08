/** Toolhelp works for ordinary users even when WMI is disabled by policy.
 * Command lines are read only for node.exe so npm CLI identity can be verified.
 * An inaccessible command line remains unknown; it is never guessed from a prompt.
 */
export const WINDOWS_PROCESS_QUERY = String.raw`
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class KanVibeProcessQuery {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct Entry {
    public uint size, usage, pid;
    public IntPtr heap;
    public uint module, threads, parent;
    public int priority;
    public uint flags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string name;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct BasicInfo { public IntPtr reserved, peb, reserved2, reserved3, pid, parent; }
  public class Item { public uint ProcessId, ParentProcessId; public string Name, CommandLine; }
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool Process32FirstW(IntPtr snapshot, ref Entry entry);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool Process32NextW(IntPtr snapshot, ref Entry entry);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] data, IntPtr size, out IntPtr read);
  [DllImport("kernel32.dll")] static extern bool IsWow64Process(IntPtr process, out bool wow);
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr process, int kind, ref BasicInfo info, int size, out int needed);
  static byte[] Read(IntPtr process, IntPtr address, int size) {
    var bytes = new byte[size]; IntPtr read;
    if (!ReadProcessMemory(process, address, bytes, new IntPtr(size), out read) || read.ToInt64() != size) return null;
    return bytes;
  }
  static string CommandLine(uint pid) {
    IntPtr handle = OpenProcess(0x410, false, pid);
    if (handle == IntPtr.Zero) return null;
    try {
      bool wow; if (IntPtr.Size != 8 || !IsWow64Process(handle, out wow) || wow) return null;
      var info = new BasicInfo(); int needed;
      if (NtQueryInformationProcess(handle, 0, ref info, Marshal.SizeOf(typeof(BasicInfo)), out needed) != 0) return null;
      var pointer = Read(handle, IntPtr.Add(info.peb, 0x20), 8);
      if (pointer == null) return null;
      var parameters = new IntPtr(BitConverter.ToInt64(pointer, 0));
      var value = Read(handle, IntPtr.Add(parameters, 0x70), 16);
      if (value == null) return null;
      int length = BitConverter.ToUInt16(value, 0);
      if (length == 0 || length > 32766) return null;
      var text = Read(handle, new IntPtr(BitConverter.ToInt64(value, 8)), length);
      return text == null ? null : System.Text.Encoding.Unicode.GetString(text);
    } finally { CloseHandle(handle); }
  }
  public static Item[] ReadAll() {
    IntPtr snapshot = CreateToolhelp32Snapshot(2, 0);
    if (snapshot == new IntPtr(-1)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    try {
      var entry = new Entry(); entry.size = (uint)Marshal.SizeOf(typeof(Entry));
      var items = new List<Item>();
      if (!Process32FirstW(snapshot, ref entry)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
      do { items.Add(new Item { ProcessId = entry.pid, ParentProcessId = entry.parent, Name = entry.name,
        CommandLine = String.Equals(entry.name, "node.exe", StringComparison.OrdinalIgnoreCase) ? CommandLine(entry.pid) : null }); }
      while (Process32NextW(snapshot, ref entry));
      return items.ToArray();
    } finally { CloseHandle(snapshot); }
  }
}
'@ -ErrorAction Stop
@([KanVibeProcessQuery]::ReadAll()) | ConvertTo-Json -Compress
`;
