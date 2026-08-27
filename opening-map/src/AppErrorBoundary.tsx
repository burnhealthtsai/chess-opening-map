import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return <main className="app-runtime-error" role="alert"><div><span aria-hidden="true">↻</span><h1>應用程式暫時載入失敗</h1><p>可能正在更新版本或網路不穩定，重新載入即可取得最新檔案。</p><button onClick={() => window.location.reload()}>重新載入應用程式</button></div></main>;
  }
}
