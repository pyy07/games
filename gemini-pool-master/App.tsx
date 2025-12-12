import React from 'react';
import { BilliardsGame } from './components/BilliardsGame';

const App: React.FC = () => {
  return (
    <div className="app-container">
      <header>
        <h1>Gemini Pool Master</h1>
        <p className="subtitle">
          Challenge the AI. Drag to shoot.<br/>
          <span style={{opacity: 0.5, fontSize: '0.8em'}}>Powered by Gemini 2.5 Flash</span>
        </p>
      </header>
      
      <main style={{width: '100%'}}>
        <BilliardsGame />
      </main>

      <footer>
        Lightweight Version • React • Gemini API
      </footer>
    </div>
  );
};

export default App;