export class ElectronAutomationAdapter {
  constructor(api = window.electronAPI?.automation) {
    if (!api) throw new Error('Electron automation API is unavailable')
    this.api = api
  }

  subscribe(listener) {
    return this.api.onEvent(listener)
  }

  start(tool) {
    return this.api.start(tool)
  }

  pause() {
    return this.api.pause()
  }

  resume() {
    return this.api.resume()
  }

  completeUserAction() {
    return this.api.completeUserAction?.()
  }

  cancel() {
    return this.api.cancel()
  }

  dispose() {}
}
