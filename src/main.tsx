// src/main.tsx
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
import MatchingPairsGamePage from './pages/MatchingPairsGamePage';
import ColumnPairsGamePage from './pages/ColumnPairsGamePage';
import ListenWordsGamePage from './pages/ListenWordsGamePage';
import FlashcardsGamePage from './pages/FlashcardsGamePage';
import { ProtectedRoute } from './routes/ProtectedRoute';

const queryClient = new QueryClient();

const Root = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<Navigate to="/dashboard" replace />} />

            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/groups"
              element={
                <ProtectedRoute>
                  <GroupsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/words"
              element={
                <ProtectedRoute>
                  <WordsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/words/new"
              element={
                <ProtectedRoute>
                  <WordFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/games/multipleChoice"
              element={
                <ProtectedRoute>
                  <MultipleChoiceGamePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/games/buildWord"
              element={
                <ProtectedRoute>
                  <BuildWordGamePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/games/matchingPairs"
              element={
                <ProtectedRoute>
                  <MatchingPairsGamePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/games/columnPairs"
              element={
                <ProtectedRoute>
                  <ColumnPairsGamePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/games/flashcards"
              element={
                <ProtectedRoute>
                  <FlashcardsGamePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/games/listenWords"
              element={
                <ProtectedRoute>
                  <ListenWordsGamePage />
                </ProtectedRoute>
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
