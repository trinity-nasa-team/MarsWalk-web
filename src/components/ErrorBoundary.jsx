// Último recurso: un error de render no deja la app en blanco; muestra un aviso y permite reintentar.
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[marswalk] error de render', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const es = (document.documentElement.lang || 'es').startsWith('es');
    return (
      <div role="alert" style={{ padding: 32, maxWidth: 520, margin: '15vh auto', textAlign: 'center' }}>
        <h2>{es ? 'Algo falló en la interfaz' : 'Something went wrong'}</h2>
        <p className="note">{es ? 'La simulación sigue guardada en esta pestaña.' : 'The simulation state is kept in this tab.'}</p>
        <button type="button" className="btn" onClick={() => this.setState({ error: null })}>
          {es ? 'Reintentar' : 'Retry'}
        </button>
      </div>
    );
  }
}
