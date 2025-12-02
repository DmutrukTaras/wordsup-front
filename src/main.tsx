import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import GroupsPage from './pages/GroupsPage';
import WordsPage from './pages/WordsPage';
import WordFormPage from './pages/WordFormPage';
import MultipleChoiceGamePage from './pages/MultipleChoiceGamePage';
import BuildWordGamePage from './pages/BuildWordGamePage';

const queryClient = new QueryClient();

const Root = () => {
  const token = localStorage.getItem('authToken');

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />}>
            <Route
              index
              element={
                token ? (
                  <Navigate to="/dashboard" replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/dashboard"
              element={
                token ? <DashboardPage /> : <Navigate to="/login" replace />
              }
            />
            <Route
              path="/groups"
              element={
                token ? <GroupsPage /> : <Navigate to="/login" replace />
              }
            />
            <Route
              path="/words"
              element={
                token ? <WordsPage /> : <Navigate to="/login" replace />
              }
            />
            <Route
              path="/words/new"
              element={
                token ? <WordFormPage /> : <Navigate to="/login" replace />
              }
            />
            <Route
              path="/games/multipleChoice"
              element={
                token ? <MultipleChoiceGamePage /> : <Navigate to="/login" replace />
              }
            />
            <Route
              path="/games/buildWord"
              element={
                token ? <BuildWordGamePage /> : <Navigate to="/login" replace />
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
