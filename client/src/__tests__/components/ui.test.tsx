import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';

describe('LoadingState', () => {
  it('renders message', () => {
    render(<LoadingState message="Loading data" />);
    expect(screen.getByText('Loading data')).toBeInTheDocument();
  });

  it('renders submessage when provided', () => {
    render(<LoadingState message="Loading" submessage="Fetching from API" />);
    expect(screen.getByText('Fetching from API')).toBeInTheDocument();
  });

  it('does not render submessage when not provided', () => {
    render(<LoadingState message="Loading" />);
    expect(screen.queryByText('Fetching from API')).not.toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('renders error message', () => {
    render(<ErrorState message="Connection failed" />);
    expect(screen.getByText('Connection failed')).toBeInTheDocument();
  });

  it('renders submessage when provided', () => {
    render(<ErrorState message="Error" submessage="Check your connection" />);
    expect(screen.getByText('Check your connection')).toBeInTheDocument();
  });

  it('renders retry button when onRetry provided', () => {
    render(<ErrorState message="Error" onRetry={() => {}} />);
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('does not render retry button when onRetry not provided', () => {
    render(<ErrorState message="Error" />);
    expect(screen.queryByText('Retry')).not.toBeInTheDocument();
  });

  it('renders compact variant correctly', () => {
    render(<ErrorState message="Compact error" compact />);
    expect(screen.getByText('Compact error')).toBeInTheDocument();
    expect(screen.queryByText('Retry')).not.toBeInTheDocument();
  });
});
