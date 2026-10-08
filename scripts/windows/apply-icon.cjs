const fs = require('node:fs');
const path = require('node:path');
const PE = require('pe-library');
const ResEdit = require('resedit');

const executable = path.resolve('dist/windows/win-unpacked/KanVibe.exe');
const exe = PE.NtExecutable.from(fs.readFileSync(executable));
const resources = PE.NtExecutableResource.from(exe);
const icons = ResEdit.Data.IconFile.from(fs.readFileSync('resources/kanvibe-windows.ico'));
for (const group of ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries)) {
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(resources.entries, group.id, group.lang, icons.icons.map(item => item.data));
}
for (const version of ResEdit.Resource.VersionInfo.fromEntries(resources.entries)) {
  version.setStringValues({ lang: 1033, codepage: 1200 }, { ProductName: 'KanVibe', FileDescription: 'KanVibe AI coding workspace' });
  version.outputToResourceEntries(resources.entries);
}
resources.outputResource(exe);
fs.writeFileSync(executable, Buffer.from(exe.generate()));
console.log('KanVibe executable icon updated.');
