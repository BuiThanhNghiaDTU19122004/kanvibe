using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;

[assembly: AssemblyTitle("KanVibe Console")]
[assembly: AssemblyProduct("KanVibe")]
[assembly: AssemblyVersion("1.4.0.0")]

internal static class KanVibeConsole
{
    private static int Main(string[] args)
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string executable = Path.Combine(root, "win-unpacked", "KanVibe.exe");
        Console.Title = "KanVibe";
        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("  KanVibe | AI coding workspace");
        Console.ResetColor();
        if (!File.Exists(executable))
        {
            Console.Error.WriteLine("Missing app: " + executable);
            Console.Error.WriteLine("Keep KanVibe-Console.exe next to the win-unpacked folder.");
            return 1;
        }
        if (Array.IndexOf(args, "--check") >= 0)
        {
            Console.WriteLine("Ready: " + executable);
            return 0;
        }
        try
        {
            var start = new ProcessStartInfo(executable);
            start.WorkingDirectory = Path.GetDirectoryName(executable);
            start.UseShellExecute = false;
            start.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            Console.WriteLine("Opening KanVibe...");
            using (var app = Process.Start(start))
            {
                if (app == null) throw new Exception("Could not create application process.");
                app.WaitForExit();
                if (app.ExitCode != 0) Console.Error.WriteLine("KanVibe exited with code " + app.ExitCode);
                return app.ExitCode;
            }
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
            return 1;
        }
    }
}
