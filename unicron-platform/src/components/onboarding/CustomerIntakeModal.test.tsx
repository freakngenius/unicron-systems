import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CustomerIntakeModal } from './CustomerIntakeModal';

describe('CustomerIntakeModal', () => {
  it('blocks submit when name is empty', () => {
    const onSubmit = vi.fn();
    render(<CustomerIntakeModal existingSlugs={[]} onCancel={() => {}} onSubmit={onSubmit} />);
    const submit = screen.getByTestId('customer-intake-submit');
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('auto-derives slug from name until operator edits the slug field', () => {
    render(<CustomerIntakeModal existingSlugs={[]} onCancel={() => {}} onSubmit={() => {}} />);
    const nameInput = screen.getByTestId('customer-intake-name-input') as HTMLInputElement;
    const slugInput = screen.getByTestId('customer-intake-slug-input') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Zedcor Surveillance' } });
    expect(slugInput.value).toBe('zedcor-surveillance');

    fireEvent.change(slugInput, { target: { value: 'zedcor' } });
    fireEvent.change(nameInput, { target: { value: 'Zedcor Inc' } });
    // Slug is sticky once the operator touched it.
    expect(slugInput.value).toBe('zedcor');
  });

  it('rejects slugs that already exist', () => {
    const onSubmit = vi.fn();
    render(
      <CustomerIntakeModal
        existingSlugs={['zedcor']}
        onCancel={() => {}}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByTestId('customer-intake-name-input'), {
      target: { value: 'Zedcor' },
    });
    expect(screen.getByTestId('customer-intake-slug-error')).toHaveTextContent(/already taken/i);
    fireEvent.click(screen.getByTestId('customer-intake-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits name, slug, and contactName to onSubmit', () => {
    const onSubmit = vi.fn();
    render(<CustomerIntakeModal existingSlugs={[]} onCancel={() => {}} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByTestId('customer-intake-name-input'), {
      target: { value: 'Realberry Capital' },
    });
    fireEvent.change(screen.getByTestId('customer-intake-contact-input'), {
      target: { value: 'Avery Cole' },
    });
    fireEvent.click(screen.getByTestId('customer-intake-submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Realberry Capital',
      slug: 'realberry-capital',
      contactName: 'Avery Cole',
    });
  });

  it('contactName is optional', () => {
    const onSubmit = vi.fn();
    render(<CustomerIntakeModal existingSlugs={[]} onCancel={() => {}} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByTestId('customer-intake-name-input'), {
      target: { value: 'Acme' },
    });
    fireEvent.click(screen.getByTestId('customer-intake-submit'));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Acme',
      slug: 'acme',
      contactName: '',
    });
  });

  it('cancel button fires onCancel and does not submit', () => {
    const onCancel = vi.fn();
    const onSubmit = vi.fn();
    render(
      <CustomerIntakeModal existingSlugs={[]} onCancel={onCancel} onSubmit={onSubmit} />,
    );
    fireEvent.click(screen.getByTestId('customer-intake-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('backdrop click cancels', () => {
    const onCancel = vi.fn();
    render(
      <CustomerIntakeModal existingSlugs={[]} onCancel={onCancel} onSubmit={() => {}} />,
    );
    fireEvent.click(screen.getByTestId('customer-intake-modal'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
