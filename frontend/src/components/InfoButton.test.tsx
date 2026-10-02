import { fireEvent, render, screen } from '@testing-library/react';
import InfoButton from './InfoButton.tsx';

const dialogName = 'Keyboard shortcuts and mouse actions';

describe('InfoButton', () => {
  it('starts closed', () => {
    render(<InfoButton />);
    const button = screen.getByRole('button', { name: 'Info' });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the window on click', () => {
    render(<InfoButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Info' }));
    expect(screen.getByRole('dialog', { name: dialogName })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Info' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes on Escape and gives the focus back', () => {
    render(<InfoButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Info' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Close' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const info = screen.getByRole('button', { name: 'Info' });
    expect(info).toHaveFocus();
    expect(info).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes with the Close button and gives the focus back', () => {
    render(<InfoButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Info' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const info = screen.getByRole('button', { name: 'Info' });
    expect(info).toHaveFocus();
    expect(info).toHaveAttribute('aria-expanded', 'false');
  });
});
