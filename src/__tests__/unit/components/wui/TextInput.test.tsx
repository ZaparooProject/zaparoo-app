import { render, screen } from '../../../../test-utils';
import { TextInput } from '@/components/wui/TextInput';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

describe('TextInput', () => {
  it('renders input with placeholder', () => {
    render(
      <TextInput 
        value=""
        placeholder="Enter text here"
      />
    );
    
    const input = screen.getByPlaceholderText('Enter text here');
    expect(input).toBeInTheDocument();
  });

  it('calls setValue when text is entered', async () => {
    const mockSetValue = vi.fn();
    const user = userEvent.setup();
    
    render(
      <TextInput 
        value=""
        setValue={mockSetValue}
        placeholder="Enter text"
      />
    );
    
    const input = screen.getByPlaceholderText('Enter text');
    await user.type(input, 'test input');
    
    expect(mockSetValue).toHaveBeenCalledWith('test input');
  });

  it('renders save button when saveValue prop is provided', async () => {
    const mockSaveValue = vi.fn();
    const user = userEvent.setup();
    
    render(
      <TextInput 
        value="initial"
        saveValue={mockSaveValue}
      />
    );
    
    const input = screen.getByDisplayValue('initial');
    await user.clear(input);
    await user.type(input, 'modified text');
    
    const saveButton = screen.getByRole('button');
    await user.click(saveButton);
    
    expect(mockSaveValue).toHaveBeenCalledWith('modified text');
  });
});