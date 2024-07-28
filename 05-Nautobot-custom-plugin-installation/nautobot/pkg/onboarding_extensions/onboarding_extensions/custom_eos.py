"""Example of custom onboarding class."""

from nautobot_device_onboarding.nautobot_keeper import NautobotKeeper
from nautobot_device_onboarding.onboarding.onboarding import Onboarding


class MyOnboardingClass(Onboarding):
    """Custom onboarding class example.

    Main purpose of this class is to access and modify the onboarding_kwargs.
    By accessing the onboarding kwargs, user gains ability to modify
    onboarding parameters before the objects are created in Nautobot.

    This class adds the get_device_role method that does the static
     string comparison and returns the device role.
    """

    def run(self, onboarding_kwargs):
        """Ensures network device."""
        # Access hostname from onboarding_kwargs and get device role automatically
        device_new_role = self.get_device_role(hostname=onboarding_kwargs["netdev_hostname"])

        # Update the device role in onboarding kwargs dictionary
        onboarding_kwargs["netdev_nb_role_name"] = device_new_role

        nb_k = NautobotKeeper(**onboarding_kwargs)
        nb_k.ensure_device()

        self.created_device = nb_k.device

    @staticmethod
    def get_device_role(hostname):
        """Returns the device role based on hostname data.

        This is a static analysis of hostname string content only
        """
        hostname_lower = hostname.lower()
        if ("r" in hostname_lower) or ("router" in hostname_lower):
            role = "router"
        elif ("sw" in hostname_lower) or ("switch" in hostname_lower):
            role = "switch"
        elif ("fw" in hostname_lower) or ("firewall" in hostname_lower):
            role = "firewall"
        elif "dc" in hostname_lower:
            role = "datacenter"
        else:
            role = "generic"

        return role


class OnboardingDriverExtensions:
    """This is an example of a custom onboarding driver extension.

    This extension sets the onboarding_class to MyOnboardingClass,
     which is an example class of how to access and modify the device
     role automatically through the onboarding process.
    """

    def __init__(self, napalm_device):
        """Inits the class."""
        self.napalm_device = napalm_device
        self.onboarding_class = self.get_onboarding_class()
        self.ext_result = None

    def get_onboarding_class(self):
        """Return onboarding class for IOS driver.

        Currently supported is Standalone Onboarding Process

        Result of this method is used by the OnboardingManager to
        initiate the instance of the onboarding class.
        """
        return MyOnboardingClass

    def get_ext_result(self):
        """This method is used to store any object as a return value.

        Result of this method is passed to the onboarding class as
        driver_addon_result argument.

        :return: Any()
        """
        return self.ext_result
