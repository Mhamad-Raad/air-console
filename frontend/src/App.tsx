import { Routes, Route } from 'react-router-dom';
import Home from './routes/Home';
import Host from './routes/Host';
import Join from './routes/Join';
import Controller from './routes/Controller';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/host/:code" element={<Host />} />
      <Route path="/join/:code" element={<Join />} />
      <Route path="/controller/:code" element={<Controller />} />
    </Routes>
  );
}
