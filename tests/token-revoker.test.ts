import axios from 'axios';
import { TokenRevoker } from '../src/TokenRevoker';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TokenRevoker.revoke()', () => {
  let revoker: TokenRevoker;

  beforeEach(() => {
    revoker = new TokenRevoker('https://gitlab.example.com', 'glpat-xxxx1234');
    jest.clearAllMocks();
  });

  it('should revoke the token successfully', async () => {
    mockedAxios.delete.mockResolvedValue({ status: 204 });

    const result = await revoker.revoke();

    expect(result).toBe(true);
    expect(mockedAxios.delete).toHaveBeenCalledWith('https://gitlab.example.com/api/v4/personal_access_tokens/self', {
      headers: {
        'Authorization': 'Bearer glpat-xxxx1234',
        'Content-Type': 'application/json',
      },
    });
  });

  it('should throw an error when the API call fails', async () => {
    const errorResponse = { response: { status: 401, data: { message: 'Unauthorized' } } };
    mockedAxios.delete.mockRejectedValue(errorResponse);

    await expect(revoker.revoke()).rejects.toThrow('Unauthorized');
  });

  it('should throw an error on network failure', async () => {
    mockedAxios.delete.mockRejectedValue(new Error('Network Error'));

    await expect(revoker.revoke()).rejects.toThrow('Network Error');
  });

  it('should throw an error if token value is missing', async () => {
    const revokerNoToken = new TokenRevoker('https://gitlab.example.com', '');
    await expect(revokerNoToken.revoke()).rejects.toThrow('Token value is empty');
  });

  it('should throw an error if GitLab URL is invalid', async () => {
    const revokerBadUrl = new TokenRevoker('invalid-url', 'glpat-xxxx1234');
    await expect(revokerBadUrl.revoke()).rejects.toThrow('Invalid GitLab URL');
  });
});