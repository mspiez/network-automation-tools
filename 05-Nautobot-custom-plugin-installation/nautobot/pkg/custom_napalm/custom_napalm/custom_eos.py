from napalm.eos.eos import EOSDriver


class CustomEOSDriver(EOSDriver):
    """Custom NAPALM Arista EOS Handler."""

    def get_my_banner(self):
        command = 'show banner motd'
        output = self._send_command(command)

        return_vars = {}
        for line in output.splitlines():
            split_line = line.split()
            if "Site:" == split_line[0]:
                return_vars["site"] = split_line[1]
            elif "Device:" == split_line[0]:
                return_vars["device"] = split_line[1]
            elif "Floor:" == split_line[0]:
                return_vars["floor"] = split_line[1]
            elif "Room:" == split_line[0]:
                return_vars["room"] = split_line[1]
        return return_vars