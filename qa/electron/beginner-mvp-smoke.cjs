const { _electron: electron } = require('@playwright/test');
const { mkdirSync, writeFileSync, readFileSync, existsSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  assert.equal(process.platform, 'win32');
  const root=process.cwd();
  const output=path.join(root,'.tooling','beginner-mvp-smoke',String(Date.now()));
  const fixture=path.join(output,'project with spaces');
  const bin=path.join(output,'bin');
  const cli=path.join(output,'node_modules','@anthropic-ai','claude-code','cli.js');
  const argsFile=path.join(output,'received.json');
  const fixtureHome=path.join(output,'home');
  mkdirSync(fixture,{recursive:true}); mkdirSync(bin,{recursive:true}); mkdirSync(path.dirname(cli),{recursive:true});
  execFileSync('git',['init','-b','main',fixture],{windowsHide:true});
  writeFileSync(path.join(fixture,'README.md'),'Smoke fixture\n');
  execFileSync('git',['-C',fixture,'add','README.md'],{windowsHide:true});
  execFileSync('git',['-C',fixture,'-c','user.name=KanVibe QA','-c','user.email=qa@example.invalid','commit','-m','Fixture'],{windowsHide:true});
  mkdirSync(fixtureHome,{recursive:true});
  writeFileSync(cli,`
    const fs=require('node:fs'),path=require('node:path'); const args=process.argv.slice(2);
    if(args.includes('--version')){console.log('Smoke CLI 1.0');process.exit(0)}
    if(args[0]==='auth'){console.log(JSON.stringify({loggedIn:true,authMethod:'claude.ai',email:'qa@example.invalid'}));process.exit(0)}
    fs.writeFileSync(${JSON.stringify(argsFile)},JSON.stringify(args));
    const cwd=process.cwd(),dir=path.join(${JSON.stringify(fixtureHome)},'.claude','projects',cwd.replaceAll(path.sep,'-').replaceAll('_','-').replaceAll(':','-'));
    fs.mkdirSync(dir,{recursive:true});
    const sessionId='qa-session',timestamp=new Date().toISOString();
    fs.writeFileSync(path.join(dir,sessionId+'.jsonl'),[
      {type:'user',sessionId,cwd,timestamp,message:{role:'user',content:args.at(-1)}},
      {type:'assistant',sessionId,cwd,timestamp:new Date(Date.now()+100).toISOString(),message:{role:'assistant',content:'QA latest assistant response'}}
    ].map(e=>JSON.stringify(e)).join('\\n')+'\\n');
    fs.writeFileSync(path.join(cwd,'smoke-change.txt'),'QA changed file\\n');
    console.log('FAKE_CLAUDE_RUNNING'); process.stdin.resume(); process.stdin.on('data',()=>process.exit(0));
  `);
  writeFileSync(path.join(bin,'claude.cmd'),`@echo off\r\n"${process.execPath}" "${cli}" %*\r\n`);
  const env={...process.env};
  for(const key of Object.keys(env)) if(key.toLowerCase()==='path') delete env[key];
  env.PATH=`${bin};${process.env.PATH};${process.env.SystemRoot}\\System32`;
  env.KANVIBE_APP_DATA_DIR=path.join(output,'app-data');
  env.HOME=fixtureHome; env.USERPROFILE=fixtureHome;
  const app=await electron.launch({executablePath:require('electron'),args:[root,'--disable-gpu','--no-sandbox'],env,timeout:60000});
  const failures=[];
  try {
    const page=await app.firstWindow(); page.on('pageerror',e=>failures.push(e.message));
    await page.waitForFunction(()=>!!window.kanvibeDesktop?.invoke);
    await page.evaluate(async()=> { await window.kanvibeDesktop.invoke('appSettings','setAppSetting',['onboarding_seen','true']); location.hash='#/en'; });
    await page.getByTestId('vibe-dashboard-view').waitFor({timeout:60000});
    const scan=await page.evaluate(directory=>window.kanvibeDesktop.invoke('project','scanAndRegisterProjects',[directory]),fixture); assert.equal(scan.errors.length,0);
    await page.evaluate(()=>location.reload()); await page.getByTestId('vibe-dashboard-view').waitFor({timeout:60000});
    await page.screenshot({path:path.join(output,'dashboard-en.png'),fullPage:true});
    await page.getByRole('combobox',{name:'Language'}).selectOption('vi');
    await page.waitForFunction(()=>document.documentElement.lang==='vi'); assert.equal(await page.evaluate(()=>localStorage.getItem('kanvibe:locale')),'vi');
    await page.getByTestId('dashboard-new-task-btn').click();
    const prompt='Sửa lỗi đăng nhập với "quote" và $() `tick` & | %\nGiữ nguyên dòng thứ hai';
    await page.locator('#create-task-prompt').fill(prompt);
    assert.equal(await page.locator('#create-task-title').inputValue(),prompt.split('\n')[0]);
    await page.screenshot({path:path.join(output,'create-task-vi.png'),fullPage:true});
    await page.getByRole('button',{name:'Tạo và bắt đầu'}).click();
    await page.getByTestId('task-workspace').waitFor({timeout:60000});
    await page.waitForFunction(()=>!location.hash.includes('autostart'),undefined,{timeout:30000});
    for(let n=0;n<60 && !existsSync(argsFile);n++) await new Promise(r=>setTimeout(r,500));
    assert(existsSync(argsFile),'Fake CLI never started');
    assert.deepEqual(JSON.parse(readFileSync(argsFile,'utf8')),['--',prompt],'Prompt changed crossing PowerShell/native CLI');
    const taskId=await page.evaluate(()=>location.hash.split('/task/')[1].split('?')[0]);
    const created=await page.evaluate(id=>window.kanvibeDesktop.invoke('kanban','getTaskById',[id]),taskId); assert.equal(created.description,prompt);
    let monitor;
    for(let n=0;n<20;n++){ monitor=await page.evaluate(()=>window.kanvibeDesktop.invoke('project','getAgentMonitor',[])); if(monitor.runtimes.some(r=>r.taskId===created.id&&r.state==='running')) break; await new Promise(r=>setTimeout(r,500)); }
    assert(monitor.runtimes.some(r=>r.taskId===created.id&&r.state==='running'),'Windows did not observe CLI process');
    const duplicate=await page.evaluate(({id,tabId})=>window.kanvibeDesktop.launchAgent(id,tabId),{id:created.id,tabId:monitor.runtimes.find(r=>r.taskId===created.id).tabId});
    assert.deepEqual(duplicate,{ok:false,code:'already-running'});
    await page.getByText('QA latest assistant response',{exact:true}).first().waitFor({timeout:30000});
    await page.screenshot({path:path.join(output,'activity-vi.png'),fullPage:true});
    await page.getByRole('button',{name:'Kết quả',exact:true}).click();
    await page.getByText('smoke-change.txt',{exact:true}).waitFor({timeout:30000});
    await page.getByText('QA latest assistant response',{exact:true}).waitFor();
    await page.screenshot({path:path.join(output,'results-vi.png'),fullPage:true});
    await page.getByRole('button',{name:'Terminal',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.xterm-screen')?.textContent.includes('FAKE_CLAUDE_RUNNING'),undefined,{timeout:15000});
    await page.screenshot({path:path.join(output,'terminal-vi.png'),fullPage:true});
    await page.evaluate(({id,tabId})=>window.kanvibeDesktop.writeTerminal(id,tabId,'exit\r'),{id:created.id,tabId:monitor.runtimes.find(r=>r.taskId===created.id).tabId});
    await page.getByRole('button',{name:'Kết quả',exact:true}).click();
    await page.getByRole('button',{name:'Đánh dấu hoàn tất',exact:true}).click();
    await page.waitForFunction(async(id)=>(await window.kanvibeDesktop.invoke('kanban','getTaskById',[id])).status==='done',created.id);
    const done=await page.evaluate(id=>window.kanvibeDesktop.invoke('kanban','getTaskById',[id]),created.id);
    assert.equal(done.worktreePath,created.worktreePath); assert(existsSync(path.join(done.worktreePath,'smoke-change.txt')));
    assert.equal(await page.evaluate(()=>localStorage.getItem('kanvibe:locale')),'vi','Language preference changed before returning home');
    await page.evaluate(()=>location.hash='#/'); await page.waitForFunction(()=>location.hash.startsWith('#/vi'));
    await page.getByTestId('vibe-dashboard-view').waitFor();
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1100,750));
    await page.evaluate(async()=>{await window.kanvibeDesktop.invoke('appSettings','setAppSetting',['theme_preference','dark']);location.reload()});
    await page.getByTestId('vibe-dashboard-view').waitFor({timeout:30000});
    await page.screenshot({path:path.join(output,'dashboard-dark-1100.png'),fullPage:true});
    assert.equal(failures.length,0,JSON.stringify(failures));
    console.log(JSON.stringify({output,dashboard:true,vietnamese:true,createTask:true,autostart:true,promptPreserved:true,nativeProcessObserved:true,journal:true,diff:true,manualCompletion:true,resourcesPreserved:true,localeRestored:true,pageErrors:failures}));
  } finally { await app.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1});
