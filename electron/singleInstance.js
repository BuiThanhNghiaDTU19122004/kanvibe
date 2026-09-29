function acquireSingleInstance(app, getWindow, focusWindow) {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return false;
  }
  app.on("second-instance", () => {
    void app.whenReady().then(() => focusWindow(getWindow()));
  });
  return true;
}

module.exports = { acquireSingleInstance };
