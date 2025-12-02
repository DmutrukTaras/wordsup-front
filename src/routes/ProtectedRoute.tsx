import { Navigate } from 'react-router-dom';

interface Props {
  children: JSX.Element;
}

export const ProtectedRoute = ({ children }: Props) => {
  const token = localStorage.getItem('authToken');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
};
