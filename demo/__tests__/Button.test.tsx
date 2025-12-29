import { render, screen } from '@testing-library/react';
import { Button } from '../components/Button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Press</Button>);
    expect(screen.getByText('Press')).toBeInTheDocument();
  });
});
